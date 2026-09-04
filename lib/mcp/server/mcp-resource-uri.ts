/**
 * MCP Resource URI parser — Wave 7 Phase 7.2 (I-CROSS-6 fold).
 *
 * Extracted from the inline `processMCPRequest` resources/read branch
 * (lines 1351-1366 of pre-Wave-7 mcp-server-http-clean.js) per
 * mcp-protocol-debug-specialist I5 + architectural-review-specialist IMP-2.
 *
 * Eliminates the cache-key split-brain documented in the
 * mcp-protocol-debug discovery prompt: dash-prefixed cache keys
 * (`artifact-${id}`, `execution-${id}`, etc.) vs. colon-slash URI shapes
 * (`artifact://${id}`).
 *
 * Pure function. No `this` dependencies. No side effects.
 */

export interface ParsedResourceUri {
  /** Resource type: 'artifacts', 'executions', 'browser-workflows', or the URL hostname for mcp:// URIs */
  resourceType: string;
  /** Resource ID extracted from the URI */
  resourceId: string;
  /** Cache key as expected by SimpleResourceManager (dash-prefixed format) */
  cacheKey: string;
  /** Whether to fetch full resource content (artifacts + browser-workflows) */
  includeContent: boolean;
}

/**
 * Parse an MCP resource URI into its component parts.
 *
 * Supported URI shapes:
 *   - `artifact://${id}`              → type='artifacts', cacheKey='artifact-${id}'
 *   - `execution://${id}`             → type='executions', cacheKey='execution-${id}'
 *   - `browser-workflow://${id}`      → type='browser-workflows', cacheKey='browser-workflow-${id}'
 *   - `mcp://${hostname}/${pathParts[0]}` → type=hostname, cacheKey=resourceId
 *
 * @throws if `uri` is empty or undefined (caller responsibility to validate)
 */
export function parseResourceUri(uri: string): ParsedResourceUri {
  let resourceType: string;
  let resourceId: string;

  if (uri.startsWith('artifact://')) {
    resourceId = uri.replace('artifact://', '');
    resourceType = 'artifacts';
  } else if (uri.startsWith('execution://')) {
    resourceId = uri.replace('execution://', '');
    resourceType = 'executions';
  } else if (uri.startsWith('browser-workflow://')) {
    resourceId = uri.replace('browser-workflow://', '');
    resourceType = 'browser-workflows';
  } else {
    // Standard mcp:// format
    const parsedUrl = new URL(uri);
    resourceType = parsedUrl.hostname;
    const pathParts = parsedUrl.pathname.split('/').filter((p) => p);
    resourceId = pathParts[0] || '';
  }

  // Construct cache key using SimpleResourceManager's dash-prefixed format
  let cacheKey: string;
  if (resourceType === 'artifacts') {
    cacheKey = `artifact-${resourceId}`;
  } else if (resourceType === 'executions') {
    cacheKey = `execution-${resourceId}`;
  } else if (resourceType === 'browser-workflows') {
    cacheKey = `browser-workflow-${resourceId}`;
  } else {
    cacheKey = resourceId;
  }

  const includeContent = resourceType === 'artifacts' || resourceType === 'browser-workflows';

  return { resourceType, resourceId, cacheKey, includeContent };
}
