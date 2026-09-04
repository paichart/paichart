/**
 * Shared type definitions for resource managers
 *
 * Defines the IResourceManager interface — the common contract between:
 *   - SimpleResourceManager (JS, lib/mcp/simple-resource-manager.js)
 *   - MCPResourceManager (TS, lib/services/mcp/resourceManager.ts)
 *
 * Both managers serve different layers (MCP protocol vs REST API) but share
 * this common interface. Each extends it with layer-specific methods.
 *
 * Created: Feb 2026 — extracted to formalize the dual-manager contract.
 * See resource-manager-specialist.md for architectural rationale.
 */

// Re-export constants from shared JS for TypeScript consumers
const shared = require('./resource-manager-shared');

export const RESOURCE_KEY_PREFIX = shared.RESOURCE_KEY_PREFIX as {
  readonly ARTIFACT: 'artifact-';
  readonly EXECUTION: 'execution-';
  readonly TEMPLATE: 'template-';
};

export const CACHE_DEFAULTS = shared.CACHE_DEFAULTS as {
  readonly TTL_MS: number;
  readonly CLEANUP_INTERVAL_MS: number;
  readonly MAX_RESOURCES: number;
};

export const buildResourceKey: (type: 'artifact' | 'execution' | 'template', id: string) => string = shared.buildResourceKey;
export const parseResourceKey: (resourceKey: string) => { type: string; id: string } = shared.parseResourceKey;
export const extractPOVContext: (pov: any) => POVContext | undefined = shared.extractPOVContext;
export const generateDownloadUrl: (artifactId: string, baseUrl?: string) => string = shared.generateDownloadUrl;

/**
 * Lightweight POV context cached alongside resources for fast access control.
 * Enables ~5ms validation vs 50-100ms per-request DB queries.
 */
export interface POVContext {
  id: string;
  ownerId: string;
  teamMemberIds: string[];
  isDemo: boolean;
  tenantId?: string;
}

/**
 * Base resource shape returned by both managers.
 * SimpleResourceManager uses plain objects matching this shape.
 * MCPResourceManager extends this with EnhancedMCPResource.
 */
export interface BaseResource {
  id: string;
  name: string;
  description?: string;
  uri: string;
  type: string;
  metadata: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Resource manager statistics returned by getStats().
 */
export interface ResourceManagerStats {
  resources: number;
  maxResources: number;
  evictions: number;
  expired: number;
  cacheTtlMs: number;
}

/**
 * Common contract for both resource managers.
 *
 * SimpleResourceManager (JS, MCP layer):
 *   - Implements all methods
 *   - Also has: registerResource(), updateResource(), discoverArtifactResources(),
 *     trackAgentExecution(), validateAndCleanupResources()
 *
 * MCPResourceManager (TS, REST API layer):
 *   - Implements all methods (with richer return types)
 *   - Also has: readResource(), subscribeToResource(), unsubscribeFromResource(),
 *     discoverServerResources(), registerArtifactResources(), cleanupExecutionResources(),
 *     cleanupArtifactsByTask(), cleanupArtifactsByAge()
 */
export interface IResourceManager {
  /**
   * Initialize the manager (start cleanup intervals, etc.)
   */
  initialize(): Promise<boolean | void>;

  /**
   * Get a specific resource by its prefixed key.
   * SimpleResourceManager: async (may lazy-load from DB)
   * MCPResourceManager: sync (cache-only lookup)
   * @param resourceId - Prefixed key (e.g. "artifact-clxy123")
   * @param includeContent - Whether to fetch full content from DB
   */
  getResource(resourceId: string, includeContent?: boolean): BaseResource | null | Promise<BaseResource | null>;

  /**
   * List all cached resources.
   * MCPResourceManager accepts rich query options; SimpleResourceManager returns all.
   */
  listResources(options?: any): Promise<BaseResource[]>;

  /**
   * Discover execution resources from the database.
   */
  discoverExecutionResources(filters?: any): Promise<BaseResource[]>;

  /**
   * Get internal statistics for monitoring.
   */
  getStats(): ResourceManagerStats;

  /**
   * Gracefully shut down — clear caches, stop intervals.
   * MUST NOT call prisma.$disconnect() on shared singletons.
   */
  close(): Promise<void>;
}
