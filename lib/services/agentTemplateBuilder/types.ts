/**
 * Agent Template Builder Service Types
 * 
 * Shared types and interfaces for the Agent Template Builder service layer.
 * These types are used across the service, API endpoints, and UI components.
 */

/**
 * Validation result structure
 */
export interface ValidationResult {
  isValid: boolean;
  category: string;
  errors: string[];
  warnings: string[];
}

/**
 * MCP Tool structure from service discovery
 */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: any;
}

/**
 * Enhanced tool data with categorization and metadata
 */
export interface ToolData {
  toolId: string;
  serverName: string;
  toolName: string;
  description: string;
  inputSchema?: any;
  category: string;
}

/**
 * MCP Server information
 */
export interface MCPServerInfo {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  toolCount: number;
  lastPing?: Date;
  description?: string;
  version?: string;
}

/**
 * Template validation summary
 */
export interface TemplateValidationSummary {
  isValid: boolean;
  results: ValidationResult[];
  summary: string;
  error?: string;
}

/**
 * Template enhancement options
 */
export interface TemplateEnhancementOptions {
  includeWorkflowDefaults?: boolean;
  includeTokenDefaults?: boolean;
  includeSecurityDefaults?: boolean;
}

/**
 * Service method filters for template retrieval
 */
export interface TemplateFilters {
  category?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
  includeMetrics?: boolean;
}

/**
 * MCP tool discovery options
 */
export interface MCPToolDiscoveryOptions {
  serverName?: string;
  category?: string;
  includeDescription?: boolean;
}

/**
 * Service response wrapper
 */
export interface ServiceResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Template creation/update data
 */
export interface TemplateData {
  id?: string;
  name: string;
  description?: string;
  category: string;
  defaultRole: string;
  promptTemplate: string;
  capabilities: Record<string, any>;
  constraints: Record<string, any>;
  maxRetries?: number;
  timeout?: number;
  priority?: string;
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
  contextTemplate?: Record<string, any>;
  metadata?: Record<string, any>;
  version?: string;
  status?: string;
  isDefault?: boolean;
  tags?: string[];
  createdBy?: string;
}
