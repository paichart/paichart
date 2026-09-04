/**
 * MCP Method Registry — Wave 7 Phase 7.2 (D6 fold)
 *
 * **SYMMETRY**: This module is the dispatch-side companion of
 * `lib/auth/mcp-method-classifier.ts`. The two have different scopes:
 *
 *   - `MCP_PUBLIC_METHODS` (mcp-method-classifier.ts) — AUTH-SIDE subset
 *     of methods allowed WITHOUT authentication (initialize, ping,
 *     notifications/initialized, tools/list, resources/list, prompts/list).
 *     Used by the R11/R12 auth middleware to gate requests.
 *
 *   - `VALID_MCP_METHODS` (THIS FILE) — DISPATCH-SIDE full set of methods
 *     `MCPCoreManager.processRequest()` knows how to dispatch. SUPERSET of
 *     MCP_PUBLIC_METHODS. Used inside processRequest to emit JSON-RPC
 *     -32601 'method not found' before any handler logic runs.
 *
 * **MAINTENANCE CONTRACT**: If a method is added to MCP_PUBLIC_METHODS
 * (auth gate), it MUST also be added to VALID_MCP_METHODS (dispatch) AND
 * have a corresponding case in `MCPCoreManager.processRequest()`'s switch.
 * The C-PRE-2 PRE-EXISTING bug (ping in MCP_PUBLIC_METHODS but missing from
 * VALID_MCP_METHODS, fixed in Wave 7 Phase 7.0a) is exactly this drift.
 *
 * MCP spec versions supported: 2025-03-26 (Claude.ai browser) +
 * 2025-06-18 (Claude Desktop). Phase 0 Plan v2 I4 deferred the broader
 * protocolVersion expansion to TODO1-mcp-spec-feature-gap-analysis.md.
 */

export const VALID_MCP_METHODS = Object.freeze([
  'initialize',
  // Phase 7.0a (2026-05-21): 'ping' added — was in MCP_PUBLIC_METHODS but
  // dispatch-rejected as -32601 (C-PRE-2 fix).
  'ping',
  'tools/list',
  'tools/call',
  'prompts/list',
  'prompts/get',
  'resources/list',
  'resources/read',
  'resources/subscribe',
  'resources/unsubscribe',
  'notifications/initialized',
  'notifications/message',
  'notifications/progress',
] as const);

export type MCPMethodName = typeof VALID_MCP_METHODS[number];
