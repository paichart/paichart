/**
 * MCP type definitions shared across the MCP service layer.
 *
 * HISTORY (2026-07-17): this file previously exported a legacy `MCPIntegration`
 * class + `mcpIntegration` singleton whose entire runtime was mock scaffolding
 * ("Mock result from tool X", mock client connections) that never escaped its
 * private state. 8 months of prod logs (positive-control-verified) showed zero
 * executions; every wiring site bypassed it. Deleted per Bug Class 79 follow-up
 * (cline_docs/follow-ups/dead-mcp-layers-deletion-2026-07-17.md). The live tool
 * execution path is mcpServerManager / mcpService — NOT this file.
 * Only the type exports below were ever consumed by other modules.
 */

/**
 * MCP Tool Definition
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  outputSchema?: {
    type: 'object';
    properties: Record<string, any>;
  };
}

/**
 * MCP Server Configuration
 */
export interface MCPServerConfig {
  name: string;
  description: string;
  version: string;
  transport: {
    type: 'stdio' | 'sse' | 'websocket' | 'streamable-http' | 'embedded';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
  };
  capabilities: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
    logging?: boolean;
  };
  authentication?: {
    type: 'none' | 'bearer' | 'api_key';
    token?: string;
    apiKey?: string;
  };
}

/**
 * MCP Resource Definition
 */
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  annotations?: {
    audience?: string[];
    priority?: number;
  };
}

/**
 * MCP Tool Execution Result
 */
export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
  _meta?: Record<string, any>;
}
