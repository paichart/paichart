/**
 * MCP Storage Migration Service
 * 
 * Migrates MCP configuration from metadata.mcpConfiguration to dedicated schema fields
 * Following the unified storage architecture defined in MCPStorageArchitectureAnalysis.md
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { mcpLogger } from '@/lib/logger';

// Type definitions for unified MCP storage
export interface MCPToolConfig {
  id: string;
  name: string;
  serverName: string;
  configuration?: Record<string, any>;
  permissions?: string[];
}

export interface MCPWorkflowConfig {
  phases: Record<string, string>;
  executionOrder: string[];
  parallelExecution?: boolean;
  errorHandling?: 'stop' | 'continue' | 'retry';
}

export interface UnifiedMCPContext {
  // Core configuration
  agentRole: string;
  executionType: string;
  sessionId?: string;
  preserveContext?: boolean;
  
  // Tool configuration
  tools: MCPToolConfig[];
  
  // Workflow configuration
  workflow: MCPWorkflowConfig;
  
  // Success metrics
  successMetrics: string[];
  
  // Metadata
  configuredVia: 'mcp' | 'ui' | 'template';
  configuredAt: string;
  version: string;
}

export interface MCPValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface MCPMigrationResult {
  taskId: string;
  success: boolean;
  migrated: boolean;
  errors: string[];
  warnings: string[];
  originalConfig?: any;
  migratedConfig?: UnifiedMCPContext;
}

/**
 * Validates MCP configuration structure
 */
export function validateMCPConfiguration(mcpConfig: any): MCPValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!mcpConfig) {
    errors.push('MCP configuration is required');
    return { isValid: false, errors, warnings };
  }
  
  // Handle missing agentRole by providing a sensible default
  const agentRole = mcpConfig.agentRole || mcpConfig.role || 'ai_assistant';
  if (!agentRole || agentRole === 'ai_assistant') {
    warnings.push('agentRole was missing, defaulted to "ai_assistant"');
  }
  
  // Validate tools
  if (mcpConfig.tools && !Array.isArray(mcpConfig.tools)) {
    errors.push('tools must be an array');
  }
  
  if (mcpConfig.mcpTools && !Array.isArray(mcpConfig.mcpTools)) {
    errors.push('mcpTools must be an array');
  }
  
  // Validate workflow
  if (mcpConfig.workflow && typeof mcpConfig.workflow !== 'object') {
    errors.push('workflow must be an object');
  }
  
  // Validate success metrics
  if (mcpConfig.successMetrics && !Array.isArray(mcpConfig.successMetrics)) {
    errors.push('successMetrics must be an array');
  }
  
  // Validate execution type
  if (mcpConfig.executionType && typeof mcpConfig.executionType !== 'string') {
    errors.push('executionType must be a string');
  }
  
  // Warnings for deprecated fields
  if (mcpConfig.mcpTools && !mcpConfig.tools) {
    warnings.push('mcpTools is deprecated, use tools instead');
  }
  
  if (mcpConfig.role && !mcpConfig.agentRole) {
    warnings.push('role is deprecated, use agentRole instead');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Converts legacy MCP configuration to unified format
 */
export function convertToUnifiedMCPContext(legacyConfig: any): UnifiedMCPContext {
  // Extract tools configuration
  const tools: MCPToolConfig[] = [];
  const rawTools = legacyConfig.mcpTools || legacyConfig.tools || [];
  
  if (Array.isArray(rawTools)) {
    rawTools.forEach((tool: any, index: number) => {
      if (typeof tool === 'string') {
        // Simple tool name
        tools.push({
          id: `tool-${index}`,
          name: tool,
          serverName: 'unknown'
        });
      } else if (typeof tool === 'object' && tool.name) {
        // Tool object
        tools.push({
          id: tool.id || `tool-${index}`,
          name: tool.name,
          serverName: tool.serverName || tool.server || 'unknown',
          configuration: tool.configuration || tool.config,
          permissions: tool.permissions
        });
      }
    });
  }
  
  // Extract workflow configuration
  const workflow: MCPWorkflowConfig = {
    phases: {},
    executionOrder: []
  };
  
  if (legacyConfig.workflow && typeof legacyConfig.workflow === 'object') {
    if (Array.isArray(legacyConfig.workflow)) {
      // Array format: [{name, description, order}]
      legacyConfig.workflow.forEach((phase: any) => {
        if (phase.name && phase.description) {
          workflow.phases[phase.name] = phase.description;
          workflow.executionOrder.push(phase.name);
        }
      });
    } else {
      // Object format: {phaseName: description}
      workflow.phases = { ...legacyConfig.workflow };
      workflow.executionOrder = Object.keys(workflow.phases);
    }
  }
  
  // Extract success metrics
  const successMetrics = legacyConfig.successMetrics || legacyConfig.metrics || [];
  
  return {
    agentRole: legacyConfig.agentRole || legacyConfig.role || 'general_agent',
    executionType: legacyConfig.executionType || legacyConfig.type || 'standard',
    sessionId: legacyConfig.sessionId,
    preserveContext: legacyConfig.preserveContext,
    tools,
    workflow,
    successMetrics: Array.isArray(successMetrics) ? successMetrics : [],
    configuredVia: legacyConfig.configuredVia || 'mcp',
    configuredAt: legacyConfig.configuredAt || new Date().toISOString(),
    version: '1.0.0'
  };
}

/**
 * Migrates a single task's MCP configuration from metadata to dedicated fields
 */
export async function migrateMCPStorage(taskId: string): Promise<MCPMigrationResult> {
  const result: MCPMigrationResult = {
    taskId,
    success: false,
    migrated: false,
    errors: [],
    warnings: []
  };
  
  try {
    // BC19 FIX: Atomic read-modify-write for migration (read metadata → compute → write dedicated fields)
    await prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id: taskId },
        select: {
          metadata: true,
          mcpContext: true,
          mcpToolId: true,
          mcpWorkflowId: true,
          mcpMetadata: true
        }
      });

      if (!task) {
        result.errors.push(`Task not found: ${taskId}`);
        return;
      }

      // Check if already migrated
      if (task.mcpContext) {
        result.warnings.push('Task already has mcpContext - skipping migration');
        result.success = true;
        return;
      }

      // Extract MCP config from metadata
      const mcpConfig = (task.metadata as any)?.mcpConfiguration;

      if (!mcpConfig) {
        result.warnings.push('No MCP configuration found in metadata');
        result.success = true;
        return;
      }

      result.originalConfig = mcpConfig;

      // Validate configuration
      const validation = validateMCPConfiguration(mcpConfig);
      result.errors.push(...validation.errors);
      result.warnings.push(...validation.warnings);

      if (!validation.isValid) {
        result.errors.push('MCP configuration validation failed');
        return;
      }

      // Convert to unified format
      const unifiedConfig = convertToUnifiedMCPContext(mcpConfig);
      result.migratedConfig = unifiedConfig;

      // Determine primary tool ID
      let primaryToolId: string | undefined;
      if (unifiedConfig.tools.length === 1) {
        primaryToolId = unifiedConfig.tools[0].id;
      } else if (mcpConfig.primaryToolId) {
        primaryToolId = mcpConfig.primaryToolId;
      }

      // Determine workflow ID
      const workflowId = mcpConfig.workflowId || mcpConfig.mcpWorkflowId;

      // Migrate to dedicated fields
      await tx.task.update({
        where: { id: taskId },
        data: {
          mcpContext: unifiedConfig as any,
          mcpToolId: primaryToolId,
          mcpWorkflowId: workflowId,
          mcpMetadata: {
            migrationSource: 'metadata.mcpConfiguration',
            migratedAt: new Date().toISOString(),
            originalConfig: mcpConfig,
            validationResults: validation as any,
            integrationStatus: 'active'
          } as any
        }
      });

      result.success = true;
      result.migrated = true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

    if (result.migrated) {
      mcpLogger.info({ taskId }, 'MCP migration completed successfully');
    }
    
  } catch (error) {
    mcpLogger.error({ err: error, taskId }, 'MCP migration failed');
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
  }
  
  return result;
}

/**
 * Migrates all tasks with MCP configuration
 */
export async function migrateAllMCPStorage(): Promise<{
  total: number;
  migrated: number;
  skipped: number;
  failed: number;
  results: MCPMigrationResult[];
}> {
  mcpLogger.info('Starting bulk MCP migration');
  
  // Find all tasks with MCP configuration in metadata
  const tasksWithMCP = await prisma.task.findMany({
    where: {
      metadata: {
        path: ['mcpConfiguration'],
        not: Prisma.JsonNull
      }
    },
    select: { id: true },
    take: 5000,
  });
  
  mcpLogger.info({ count: tasksWithMCP.length }, 'Found tasks with MCP configuration');
  
  const results: MCPMigrationResult[] = [];
  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  
  for (const task of tasksWithMCP) {
    const result = await migrateMCPStorage(task.id);
    results.push(result);
    
    if (result.success) {
      if (result.migrated) {
        migrated++;
      } else {
        skipped++;
      }
    } else {
      failed++;
    }
  }
  
  mcpLogger.info({ migrated, skipped, failed, total: tasksWithMCP.length }, 'Bulk MCP migration completed');
  
  return {
    total: tasksWithMCP.length,
    migrated,
    skipped,
    failed,
    results
  };
}

/**
 * Rollback migration for a specific task
 */
export async function rollbackMCPMigration(taskId: string): Promise<boolean> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { mcpMetadata: true }
    });
    
    if (!task?.mcpMetadata) {
      mcpLogger.warn({ taskId }, 'No migration metadata found for rollback');
      return false;
    }
    
    const metadata = task.mcpMetadata as any;
    const originalConfig = metadata.originalConfig;
    
    if (!originalConfig) {
      mcpLogger.warn({ taskId }, 'No original config found for rollback');
      return false;
    }
    
    // Restore original configuration
    await prisma.task.update({
      where: { id: taskId },
      data: {
        metadata: {
          mcpConfiguration: originalConfig
        },
        mcpContext: Prisma.JsonNull,
        mcpToolId: null,
        mcpWorkflowId: null,
        mcpMetadata: Prisma.JsonNull
      }
    });
    
    mcpLogger.info({ taskId }, 'MCP migration rollback completed');
    return true;
    
  } catch (error) {
    mcpLogger.error({ err: error, taskId }, 'MCP migration rollback failed');
    return false;
  }
}
