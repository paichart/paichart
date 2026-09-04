/**
 * Simple Resource Manager for MCP Server v5
 * JavaScript version to avoid TypeScript import issues
 *
 * Implements IResourceManager interface (see resource-manager-types.ts).
 * For architectural rationale on why both this and MCPResourceManager exist,
 * see resource-manager-specialist.md.
 */

// Use global Prisma singleton from lib/prisma.ts (Dec 2025 consolidation)
// This prevents connection pool exhaustion by reusing a single shared pool
const { prisma: globalPrisma } = require('../prisma');
const { EventEmitter } = require('events');
const { mcpLogger, createAdapter } = require('../js-logger');
const log = createAdapter(mcpLogger.child({ component: 'simple-resource-manager' }));
const {
  RESOURCE_KEY_PREFIX,
  CACHE_DEFAULTS,
  buildResourceKey,
  parseResourceKey,
  extractPOVContext,
  generateDownloadUrl,
} = require('./resource-manager-shared');

class SimpleResourceManager extends EventEmitter {
  constructor(prisma) {
    super();
    // DI pattern: Use injected prisma or fall back to global singleton (never create new)
    this.prisma = prisma || globalPrisma;
    this.resources = new Map();

    // Map size limits (time-bomb-detection-pattern.md - Category 1: Unbounded Caches)
    this.MAX_RESOURCES = CACHE_DEFAULTS.MAX_RESOURCES;
    this.evictionStats = { count: 0, expired: 0 };

    // P2 fix (Feb 2026): TTL-based expiration — matches MCPResourceManager's 10-minute default
    this.CACHE_TTL_MS = CACHE_DEFAULTS.TTL_MS;
    this._cleanupInterval = null;
  }

  async initialize() {
    // Start periodic TTL cleanup (every 5 minutes)
    if (!this._cleanupInterval) {
      this._cleanupInterval = setInterval(() => {
        this._cleanupExpired();
      }, 5 * 60 * 1000);
      // Prevent blocking process exit
      if (this._cleanupInterval.unref) {
        this._cleanupInterval.unref();
      }
    }
    return true;
  }

  /**
   * Remove resources whose TTL has expired.
   * Artifact/execution resources that are still in the DB will be re-discovered.
   */
  _cleanupExpired() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, resource] of this.resources.entries()) {
      if (resource._expiresAt && now > resource._expiresAt) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.resources.delete(key);
      this.evictionStats.expired++;
    }

    if (expiredKeys.length > 0) {
      log.info(`[SimpleResourceManager] TTL cleanup: removed ${expiredKeys.length} expired resources (total: ${this.evictionStats.expired})`);
    }
  }

  async registerResource(resourceData) {
    try {
      // LRU eviction if at capacity (time-bomb-detection-pattern.md)
      if (this.resources.size >= this.MAX_RESOURCES) {
        const oldestKey = this.resources.keys().next().value;
        if (oldestKey) {
          this.resources.delete(oldestKey);
          this.evictionStats.count++;
          log.info(`[SimpleResourceManager] LRU eviction: removed ${oldestKey} (total evictions: ${this.evictionStats.count})`);
        }
      }

      const resource = {
        id: resourceData.id || `resource-${Date.now()}`,
        name: resourceData.name,
        description: resourceData.description,
        uri: resourceData.uri,
        type: resourceData.type || 'other',
        metadata: resourceData.metadata || {},
        createdAt: new Date(),
        content: resourceData.content, // Include content if provided
        _expiresAt: Date.now() + this.CACHE_TTL_MS // P2: TTL expiration
      };

      this.resources.set(resource.id, resource);
      this.emit('resource:registered', resource);
      
      return resource;
    } catch (error) {
      log.error('[SimpleResourceManager] Error registering resource:', error);
      throw error;
    }
  }

  async updateResource(resourceId, updates) {
    try {
      const resource = this.resources.get(resourceId);
      if (!resource) {
        throw new Error(`Resource not found: ${resourceId}`);
      }

      Object.assign(resource, updates);
      resource.updatedAt = new Date();
      resource._expiresAt = Date.now() + this.CACHE_TTL_MS; // P2: Refresh TTL on update

      this.resources.set(resourceId, resource);
      this.emit('resource:updated', resource);
      
      return resource;
    } catch (error) {
      log.error('[SimpleResourceManager] Error updating resource:', error);
      throw error;
    }
  }

  async getResource(resourceId, includeContent = false) {
    let resource = this.resources.get(resourceId);
    
    // For artifact resources, always validate they still exist
    if (resourceId.startsWith(RESOURCE_KEY_PREFIX.ARTIFACT)) {
      const artifactId = resourceId.slice(RESOURCE_KEY_PREFIX.ARTIFACT.length);
      
      // Check if artifact still exists in database
      const artifactExists = await this.prisma.agentArtifact.findUnique({
        where: { id: artifactId },
        select: { id: true }
      });
      
      if (!artifactExists) {
        // Remove from cache if it no longer exists
        if (resource) {
          this.resources.delete(resourceId);
        }
        return null;
      }
      
      // If we need content and resource exists, fetch it
      if (includeContent && resource) {
        const artifact = await this.prisma.agentArtifact.findUnique({
          where: { id: artifactId },
          select: { content: true }
        });
        
        if (artifact) {
          // Add content to the resource object in MCP-compliant format
          resource = {
            ...resource,
            content: artifact.content, // For MCP server compatibility
            contents: [{
              mimeType: resource.metadata.mimeType || "text/plain",
              text: artifact.content
            }]
          };
        }
      }
    }
    
    // If not found and it's an artifact, try to fetch from database
    if (!resource && resourceId.startsWith(RESOURCE_KEY_PREFIX.ARTIFACT)) {
      
      const artifactId = resourceId.slice(RESOURCE_KEY_PREFIX.ARTIFACT.length);
      try {
        const artifact = await this.prisma.agentArtifact.findUnique({
          where: { id: artifactId },
          include: { 
            execution: { 
              include: { 
                task: true 
              } 
            } 
          }
        });
        
        if (artifact) {
          const downloadUrl = generateDownloadUrl(artifact.id);
          
          // Force download behavior for Claude Desktop (same logic as discovery)
          const forceDownloadMode = process.env.MCP_ARTIFACTS_FORCE_DOWNLOAD !== 'false';
          
          let mimeType;
          if (forceDownloadMode) {
            mimeType = 'application/octet-stream';
          } else {
            mimeType = artifact.type === 'application/json' ? 'application/json' : 
                       artifact.type === 'text/markdown' ? 'text/markdown' : 'text/plain';
          }
          
          resource = await this.registerResource({
            id: resourceId,
            name: `${artifact.name} — ${artifact.execution.task?.title || 'Unknown Task'}`,
            description: `📄 ${artifact.execution.task?.title || 'Unknown Task'}\n📦 Size: ${(artifact.content.length / 1024).toFixed(1)}KB\n⬇️ Downloadable artifact`,
            uri: `mcp://artifacts/${artifact.id}`,
            type: 'artifact',
            metadata: {
              artifactId: artifact.id,
              executionId: artifact.executionId,
              type: artifact.type, // Keep original type for reference
              size: artifact.content.length,
              createdAt: artifact.createdAt,
              mimeType: mimeType,
              downloadUrl: downloadUrl,
              downloadable: true,
              forceDownload: forceDownloadMode,
              expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour
            }
          });
        } else {
        }
      } catch (error) {
        log.error(`[SimpleResourceManager] Error fetching artifact ${artifactId}:`, error);
      }
    }
    
    // Similar lazy loading for execution resources
    if (!resource && resourceId.startsWith(RESOURCE_KEY_PREFIX.EXECUTION)) {
      
      const executionId = resourceId.slice(RESOURCE_KEY_PREFIX.EXECUTION.length);
      try {
        const execution = await this.prisma.agentExecution.findUnique({
          where: { id: executionId },
          include: {
            task: true,
            agentTemplate: true
          }
        });
        
        if (execution) {
          resource = await this.registerResource({
            id: resourceId,
            name: `Execution: ${execution.task?.title || 'Unknown Task'}`,
            description: `Agent execution from ${execution.createdAt}`,
            uri: `mcp://executions/${execution.id}`,
            type: 'execution',
            metadata: {
              executionId: execution.id,
              status: execution.status,
              template: execution.agentTemplate?.name
            }
          });
        } else {
        }
      } catch (error) {
        log.error(`[SimpleResourceManager] Error fetching execution ${executionId}:`, error);
      }
    }

    return resource;
  }

  async listResources() {
    return Array.from(this.resources.values());
  }
  
  // Debug method to check cached resources
  getCachedResourceIds() {
    return Array.from(this.resources.keys());
  }

  // Stats for monitoring (time-bomb-detection-pattern.md)
  getStats() {
    return {
      resources: this.resources.size,
      maxResources: this.MAX_RESOURCES,
      evictions: this.evictionStats.count,
      expired: this.evictionStats.expired,
      cacheTtlMs: this.CACHE_TTL_MS
    };
  }

  async discoverExecutionResources(filters = {}) {
    try {
      // Basic execution resource discovery
      
      const executions = await this.prisma.agentExecution.findMany({
        take: filters.limit || 20,
        orderBy: { createdAt: 'desc' },
        include: {
          task: true,
          agentTemplate: true
        }
      });

      const resources = executions.map(execution => ({
        id: buildResourceKey('execution', execution.id),
        name: `Execution: ${execution.task?.title || 'Unknown Task'}`,
        description: `Agent execution from ${execution.createdAt}`,
        uri: `mcp://executions/${execution.id}`,
        type: 'execution',
        metadata: {
          executionId: execution.id,
          status: execution.status,
          template: execution.agentTemplate?.name
        }
      }));

      // Register discovered resources
      for (const resource of resources) {
        await this.registerResource(resource);
      }

      return resources;
    } catch (error) {
      log.error('[SimpleResourceManager] Error discovering resources:', error);
      return [];
    }
  }

  /**
   * Discover artifact resources with POV context caching
   *
   * v4 Performance Optimization: Includes POV context in discovery query
   * to enable fast validation (5ms) instead of separate DB queries (50-100ms)
   *
   * @param {Object} options - Discovery options (limit, etc.)
   * @returns {Array} Array of resource objects with cached POV context
   */
  async discoverArtifactResources(options = {}) {
    try {

      // v4: Include POV context in query for caching optimization
      const artifacts = await this.prisma.agentArtifact.findMany({
        include: {
          execution: {
            include: {
              task: {
                include: {
                  pov: {
                    select: {
                      id: true,
                      ownerId: true,
                      metadata: true,
                      team: {
                        select: {
                          members: {
                            select: { userId: true }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        take: options.limit || 50,
        orderBy: { createdAt: 'desc' }
      });
      
      const resources = artifacts.map(artifact => {
        const downloadUrl = generateDownloadUrl(artifact.id);
        
        // Force download behavior for Claude Desktop by using binary MIME type
        // This ensures artifacts show as downloadable files rather than inline viewable content
        const forceDownloadMode = process.env.MCP_ARTIFACTS_FORCE_DOWNLOAD !== 'false'; // Default: true
        
        // Determine MIME type based on download mode
        let mimeType;
        if (forceDownloadMode) {
          // Use generic binary type to ensure download buttons appear
          mimeType = 'application/octet-stream';
        } else {
          // Use actual MIME types (may be displayed inline)
          mimeType = artifact.type === 'application/json' ? 'application/json' : 
                     artifact.type === 'text/markdown' ? 'text/markdown' : 'text/plain';
        }
        
        // Clean resource name - remove type suffix for better display
        const taskTitle = artifact.execution?.task?.title || 'Unknown Task';
        const cleanName = `${artifact.name} — ${taskTitle}`;  // e.g. "result.json — Design Security Architecture"

        // v4: Extract POV context for caching optimization (shared helper)
        const pov = artifact.execution?.task?.pov;
        const povId = artifact.execution?.task?.povId;
        const povContext = extractPOVContext(pov);

        return {
          id: buildResourceKey('artifact', artifact.id),
          name: cleanName,
          description: `📄 ${artifact.execution.task?.title || 'Unknown Task'}\n📦 Size: ${(artifact.content.length / 1024).toFixed(1)}KB\n⬇️ Downloadable artifact`,
          uri: `mcp://artifacts/${artifact.id}`,
          type: 'artifact',
          metadata: {
            artifactId: artifact.id,
            executionId: artifact.executionId,
            type: artifact.type, // Keep original type for reference
            size: artifact.content.length,
            createdAt: artifact.createdAt,
            mimeType: mimeType,
            downloadUrl: downloadUrl,
            downloadable: true,
            forceDownload: forceDownloadMode,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
            // v4: Cached POV context for fast validation (5ms vs 50-100ms DB query)
            povId: povId,
            povContext: povContext
          }
        };
      });

      // Register discovered resources
      for (const resource of resources) {
        await this.registerResource(resource);
      }

      return resources;
    } catch (error) {
      log.error('[SimpleResourceManager] Error discovering artifact resources:', error);
      return [];
    }
  }

  async trackAgentExecution(executionId) {
    try {
      
      const execution = await this.prisma.agentExecution.findUnique({
        where: { id: executionId },
        include: {
          task: {
            include: {
              pov: true,
              phase: true
            }
          },
          agentTemplate: true
        }
      });

      if (execution) {
        await this.registerResource({
          id: buildResourceKey('execution', executionId),
          name: `Execution: ${execution.task?.title}`,
          description: `Real-time execution tracking`,
          uri: `mcp://executions/${executionId}`,
          type: 'execution',
          metadata: {
            executionId: executionId,
            status: execution.status,
          }
        });
      }

      return execution;
    } catch (error) {
      log.error('[SimpleResourceManager] Error tracking execution:', error);
      return null;
    }
  }

  async validateAndCleanupResources() {
    try {
      const staleResources = [];
      
      for (const [resourceId, resource] of this.resources.entries()) {
        if (resourceId.startsWith(RESOURCE_KEY_PREFIX.ARTIFACT)) {
          const artifactId = resourceId.slice(RESOURCE_KEY_PREFIX.ARTIFACT.length);
          const exists = await this.prisma.agentArtifact.findUnique({
            where: { id: artifactId },
            select: { id: true }
          });
          
          if (!exists) {
            staleResources.push(resourceId);
          }
        } else if (resourceId.startsWith(RESOURCE_KEY_PREFIX.EXECUTION)) {
          const executionId = resourceId.slice(RESOURCE_KEY_PREFIX.EXECUTION.length);
          const exists = await this.prisma.agentExecution.findUnique({
            where: { id: executionId },
            select: { id: true }
          });
          
          if (!exists) {
            staleResources.push(resourceId);
          }
        }
      }
      
      // Remove stale resources
      for (const resourceId of staleResources) {
        this.resources.delete(resourceId);
      }
      
      if (staleResources.length > 0) {
      }
      
      return staleResources.length;
    } catch (error) {
      log.error('[SimpleResourceManager] Error during resource cleanup:', error);
      return 0;
    }
  }

  async close() {
    // P1 fix (Feb 2026): Do NOT call $disconnect() — this class uses the global
    // shared Prisma singleton from lib/prisma.ts. Disconnecting it would break
    // every other consumer in the process. Just clear in-memory state instead.
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
    this.resources.clear();
    this.evictionStats.count = 0;
    this.evictionStats.expired = 0;
  }
}

module.exports = { SimpleResourceManager };