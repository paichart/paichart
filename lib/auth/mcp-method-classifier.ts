/**
 * MCP Method Security Classification
 *
 * Defines which MCP protocol methods can be called without authentication
 * (enables OAuth discovery for Claude Desktop while maintaining security)
 * and exposes a classifier function for use by auth middleware.
 *
 * Extracted from mcp-server-http-clean.js (§C, Wave 1, 2026-05-19) per
 * cline_docs/reviews/mcp-server-http-clean-refactor-2026-05-19/current-state-inventory.md.
 *
 * Original location: `mcp-server-http-clean.js:CleanMCPHTTPServer.MCP_PUBLIC_METHODS`
 * (static const, was at line 159) and `CleanMCPHTTPServer.isProtectedMethod()`
 * (instance method, was at line 217).
 *
 * Rationale for extraction: pure function + pure data, zero coupling to `this.*`
 * state, 6 callsites across the same file. Externalizing them eliminates
 * `this.isProtectedMethod()` indirection and `CleanMCPHTTPServer.MCP_PUBLIC_METHODS`
 * cross-class references.
 */

/**
 * MCP Method Security Classification (Dec 8, 2025)
 *
 * Defines which MCP protocol methods can be called without authentication.
 * Enables OAuth discovery for Claude Desktop while maintaining security.
 *
 * Adding a method to this list means anonymous (unauthenticated) requests
 * may invoke it. Handlers for these methods MUST filter results by auth state
 * (e.g., `tools/list` returns 0 tools for anonymous callers, full list for
 * authenticated callers).
 */
export const MCP_PUBLIC_METHODS = [
  // Protocol handshake (required for OAuth discovery)
  'initialize',
  'notifications/initialized',
  'ping',

  // Capability discovery (handlers filter results by auth state)
  'tools/list',      // Shows public tools only if unauthenticated
  'resources/list',  // Shows public resources only if unauthenticated
  'prompts/list'     // Shows public prompts only if unauthenticated
] as const;

/**
 * Classify an MCP method as requiring authentication or not.
 *
 * Secure by default: null/undefined/empty method requires auth (returns true).
 * Case-insensitive comparison against MCP_PUBLIC_METHODS.
 *
 * @param method - MCP protocol method name (e.g., "tools/list", "tools/call")
 * @returns true if the method requires authentication, false if public
 */
export function isProtectedMethod(method: string | null | undefined): boolean {
  // Secure by default: null/undefined/empty requires auth
  if (!method || method === '') {
    return true;
  }

  // Normalize to lowercase for case-insensitive comparison
  const normalizedMethod = method.toLowerCase();

  // Check if method is explicitly public
  const publicMethodsLower = MCP_PUBLIC_METHODS.map((m) => m.toLowerCase());
  if (publicMethodsLower.includes(normalizedMethod)) {
    return false; // Public method, no auth required
  }

  // All other methods are protected
  return true;
}
