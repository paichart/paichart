/**
 * Static tool definitions for MCP servers that have protocol compatibility issues
 * This bypasses the tools/list method that fails with large responses
 */

import { mcpLogger } from '@/lib/logger';

export interface StaticToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

export interface StaticServerTools {
  [serverName: string]: StaticToolDefinition[];
}

// 🎉 VICTORY! Static tools no longer needed - pure dynamic discovery works!
// All external servers (browser-use, claude-code) now support proper MCP protocol
// after the MCP Protocol Debug Specialist fixed the API usage issues.
//
// The 500+ line static tool definitions have been ELIMINATED! 🚀
//
// This is preserved as documentation of what we overcame:
// - MCP SDK v1.16.0 → v1.17.2 upgrade
// - Incorrect client.request() → correct client.listTools() API usage  
// - Parse error: "Cannot read properties of undefined (reading 'parse')" → SOLVED
// - Dynamic tool discovery now works perfectly!

export const STATIC_SERVER_TOOLS: StaticServerTools = {
  // 🏆 ALL STATIC TOOLS ELIMINATED - PURE DYNAMIC DISCOVERY ACHIEVED! 🏆
};

/**
 * Check if a server has static tool definitions
 * 🎉 ALWAYS RETURNS FALSE NOW - Pure dynamic discovery achieved!
 */
export function hasStaticTools(serverName: string): boolean {
  // Victory achieved! No static tools needed anymore
  mcpLogger.debug({ serverName }, 'Server using 100% dynamic tool discovery');
  return false;
}

/**
 * Get static tools for a server
 */
export function getStaticTools(serverName: string): StaticToolDefinition[] {
  return STATIC_SERVER_TOOLS[serverName] || [];
}