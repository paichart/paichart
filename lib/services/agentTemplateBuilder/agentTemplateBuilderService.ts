import logger from '@/lib/logger';
import { TokenManager } from '@/lib/services/llm/tokenManager';
import { TemplateValidationService } from './templateValidationService';
import { 
  PAICHART_UNIVERSAL_BASE_TEMPLATE, 
  getRoleSpecificGuidance,
  generateCompleteTemplate,
  PAICHART_UNIVERSAL_METADATA 
} from './pAIchartUniversalTemplate';
import {
  ValidationResult,
  MCPTool,
  ToolData,
  MCPServerInfo,
  TemplateValidationSummary,
  TemplateFilters,
  MCPToolDiscoveryOptions,
  TemplateData
} from './types';

/**
 * Agent Template Builder Service
 * 
 * Core service layer that wraps existing APIs with builder enhancements.
 * Provides additional functionality for workflow integration, MCP tool discovery,
 * and template optimization while leveraging existing infrastructure.
 */
export class AgentTemplateBuilderService {
  /**
   * Get templates using existing API with enhanced filtering
   */
  static async getTemplates(filters: TemplateFilters) {
    try {
      // Use existing /api/agent-templates endpoint
      const params = new URLSearchParams();
      if (filters.category) params.set('category', filters.category);
      if (filters.status) params.set('status', filters.status);
      if (filters.search) params.set('search', filters.search);
      if (filters.limit) params.set('limit', filters.limit.toString());
      if (filters.offset) params.set('offset', filters.offset.toString());
      if (filters.includeMetrics) params.set('includeMetrics', 'true');
      
      const response = await fetch(`/api/agent-templates?${params}`);
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch templates');
      }
      
      return result;
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch templates');
      throw error;
    }
  }

  /**
   * Create template using existing API with builder enhancements
   */
  static async createTemplate(templateData: any, userId: string) {
    try {
      // Enhance template data with workflow integration defaults
      const enhancedData = await this.enhanceTemplateWithWorkflowConfig(templateData);
      enhancedData.createdBy = userId;
      
      // Use existing /api/agent-templates endpoint
      const response = await fetch('/api/agent-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enhancedData)
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create template');
      }
      
      return result;
    } catch (error) {
      logger.error({ err: error }, 'Failed to create template');
      throw error;
    }
  }

  /**
   * Create pAIchart Universal Agent Template in database
   */
  static async createPAIchartUniversalTemplate(userId: string) {
    try {
      logger.info('Creating pAIchart Universal Agent Template');
      
      const universalTemplateData = {
        name: PAICHART_UNIVERSAL_METADATA.name,
        description: PAICHART_UNIVERSAL_METADATA.description,
        category: PAICHART_UNIVERSAL_METADATA.category,
        defaultRole: 'strategic_technical_advisor',
        promptTemplate: PAICHART_UNIVERSAL_BASE_TEMPLATE,
        capabilities: {
          'Strategic Advisory': [
            'Business context understanding',
            'Customer value demonstration',
            'Technical excellence delivery',
            'Stakeholder communication'
          ],
          'PoV Management': [
            'Phase-aware execution',
            'Stage coordination',
            'Task sequence understanding',
            'Session continuity'
          ],
          'Tool Integration': [
            'MCP tool utilization',
            'Context-aware tool selection',
            'Result synthesis',
            'Knowledge sharing'
          ]
        },
        constraints: {
          'Quality Standards': [
            'Technical excellence required',
            'Customer satisfaction focus',
            'Strategic advisor positioning',
            'Compelling event contribution'
          ],
          'Execution Guidelines': [
            'Use available tools with precision',
            'Apply domain expertise when needed',
            'Provide confidence scores and insights',
            'Support team collaboration'
          ]
        },
        metadata: {
          isUniversal: true,
          version: PAICHART_UNIVERSAL_METADATA.version,
          variables: PAICHART_UNIVERSAL_METADATA.variables,
          baseTemplate: true
        },
        isPublic: true,
        status: 'active'
      };

      return await this.createTemplate(universalTemplateData, userId);
    } catch (error) {
      logger.error({ err: error }, 'Failed to create pAIchart Universal template');
      throw error;
    }
  }

  /**
   * Get or create pAIchart Universal Template
   */
  static async ensurePAIchartUniversalTemplate(userId: string) {
    try {
      // Check if pAIchart Universal template already exists
      const existingTemplates = await this.getTemplates({
        search: PAICHART_UNIVERSAL_METADATA.name,
        category: PAICHART_UNIVERSAL_METADATA.category,
        limit: 1
      });

      if (existingTemplates.data && existingTemplates.data.length > 0) {
        logger.debug('pAIchart Universal template already exists');
        return existingTemplates.data[0];
      }

      // Create the universal template
      logger.info('Creating new pAIchart Universal template');
      return await this.createPAIchartUniversalTemplate(userId);
    } catch (error) {
      logger.error({ err: error }, 'Failed to ensure pAIchart Universal template');
      throw error;
    }
  }

  /**
   * Generate template with role-specific additions
   */
  static generateTemplateWithRoleAdditions(agentRole: string, roleSpecificAdditions?: string): string {
    const roleGuidance = roleSpecificAdditions || getRoleSpecificGuidance(agentRole);
    return generateCompleteTemplate(roleGuidance, agentRole);
  }

  /**
   * Preview template with variable resolution
   */
  static previewTemplate(templateContent: string, agentRole: string): string {
    let preview = templateContent;
    
    // Resolve ${agentRole}
    preview = preview.replace(/\$\{agentRole\}/g, agentRole);
    
    // Resolve ${roleSpecificGuidance}
    const roleGuidance = getRoleSpecificGuidance(agentRole);
    preview = preview.replace(/\$\{roleSpecificGuidance\}/g, roleGuidance);
    
    // Resolve ${contextualInformation} with placeholder
    preview = preview.replace(/\$\{contextualInformation\}/g, 
      'Context will be provided during task execution based on actual PoV, phase, stage, and task details.');
    
    return preview;
  }

  /**
   * Update template using existing API
   */
  static async updateTemplate(templateId: string, updates: any) {
    try {
      // Use existing /api/agent-templates/[templateId] endpoint
      const response = await fetch(`/api/agent-templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update template');
      }
      
      return result;
    } catch (error) {
      logger.error({ err: error }, 'Failed to update template');
      throw error;
    }
  }

  /**
   * Get template details using existing API
   */
  static async getTemplate(templateId: string) {
    try {
      // Use existing /api/agent-templates/[templateId] endpoint
      const response = await fetch(`/api/agent-templates/${templateId}`);
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch template');
      }
      
      return result;
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch template');
      throw error;
    }
  }

  /**
   * Delete template using existing API
   */
  static async deleteTemplate(templateId: string) {
    try {
      // Use existing /api/agent-templates/[templateId] endpoint
      const response = await fetch(`/api/agent-templates/${templateId}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete template');
      }
      
      return result;
    } catch (error) {
      logger.error({ err: error }, 'Failed to delete template');
      throw error;
    }
  }

  /**
   * Discover MCP tools using direct MCP infrastructure (same as /api/mcp/tools)
   */
  static async discoverMCPTools(options: MCPToolDiscoveryOptions = {}) {
    try {
      logger.debug({ serverName: options.serverName, category: options.category }, 'Discovering MCP tools');

      const tools = [];

      // Use the tool registry directly to get all registered tools
      // This includes tools from disconnected servers with static definitions
      try {
        const { mcpToolRegistry } = await import('@/lib/services/mcp/toolRegistry');

        // Get all tools from the registry
        const registeredTools = mcpToolRegistry.searchTools({});
        
        // Convert registry tools to builder format
        const toolsFromRegistry = registeredTools
          .filter(tool => {
            // Apply server filter if specified
            if (options.serverName && tool.serverName !== options.serverName) {
              return false;
            }
            return true;
          })
          .map(tool => ({
            toolId: `${tool.serverName}:${tool.name}`,
            serverName: tool.serverName,
            toolName: tool.name,
            description: options.includeDescription ? (tool.description || `${tool.name} tool from ${tool.serverName}`) : tool.name,
            category: this.categorizeTool(tool.name),
            inputSchema: tool.inputSchema
          }));
        
        tools.push(...toolsFromRegistry);
        logger.debug({ registryToolCount: toolsFromRegistry.length }, 'Tools loaded from registry');
      } catch (registryError) {
        logger.error({ err: registryError }, 'Failed to get tools from registry');
      }
      
      
      // Apply category filter if specified
      let filteredTools = tools;
      if (options.category) {
        filteredTools = tools.filter(tool => tool.category === options.category);
      }

      logger.debug({ totalTools: filteredTools.length, category: options.category || 'all' }, 'MCP tool discovery complete');
      
      return filteredTools;
    } catch (error) {
      logger.error({ err: error }, 'Failed to discover MCP tools');
      // Return empty array instead of throwing to prevent UI breaks
      return [];
    }
  }

  /**
   * Get available MCP servers using tool registry to include disconnected servers
   */
  static async getAvailableServers(): Promise<MCPServerInfo[]> {
    try {
      const servers: MCPServerInfo[] = [];
      const serverToolCounts = new Map<string, number>();

      // Get all tools from registry to determine which servers have tools
      try {
        const { mcpToolRegistry } = await import('@/lib/services/mcp/toolRegistry');
        const allTools = mcpToolRegistry.searchTools({});

        // Count tools per server
        allTools.forEach(tool => {
          const count = serverToolCounts.get(tool.serverName) || 0;
          serverToolCounts.set(tool.serverName, count + 1);
        });
      } catch (registryError) {
        logger.error({ err: registryError }, 'Failed to get tools from registry');
      }
      
      // Get all servers from server manager (connected and disconnected)
      try {
        const { mcpServerManager } = await import('@/lib/services/mcp/serverManager');
        const allServers = mcpServerManager.listServers(); // This returns all servers
        
        for (const serverName of allServers) {
          const serverInfo = mcpServerManager.getServerInfo(serverName);
          if (serverInfo) {
            const toolCount = serverToolCounts.get(serverName) || 0;
            // Map MCPServerStatus enum to expected string values
            let status: 'connected' | 'disconnected' | 'error' = 'disconnected';
            if (serverInfo.status === 'connected') {
              status = 'connected';
            } else if (serverInfo.status === 'error') {
              status = 'error';
            }
            
            servers.push({
              name: serverName,
              status: status,
              toolCount: toolCount
            });
          }
        }
      } catch (managerError) {
        logger.error({ err: managerError }, 'Failed to access MCP server manager');
      }

      logger.debug({ serverCount: servers.length }, 'MCP server discovery complete');
      
      return servers;
    } catch (error) {
      logger.error({ err: error }, 'Failed to get available MCP servers');
      return [];
    }
  }

  /**
   * Validate template configuration
   */
  static async validateTemplate(templateData: TemplateData): Promise<TemplateValidationSummary> {
    try {
      const validationResults = [];
      
      // Basic validation
      validationResults.push(await this.validateBasicConfig(templateData));
      
      // Workflow integration validation
      if (templateData.metadata?.workflowIntegration) {
        validationResults.push(await this.validateWorkflowIntegration(templateData.metadata.workflowIntegration));
      }
      
      // MCP tools validation
      if (templateData.metadata?.mcpToolConfiguration) {
        validationResults.push(await this.validateMCPTools(templateData.metadata.mcpToolConfiguration));
      }
      
      // Token management validation
      if (templateData.metadata?.tokenManagement) {
        validationResults.push(await this.validateTokenManagement(templateData.metadata.tokenManagement));
      }
      
      const hasErrors = validationResults.some(result => !result.isValid);
      
      return {
        isValid: !hasErrors,
        results: validationResults,
        summary: this.generateValidationSummary(validationResults)
      };
    } catch (error) {
      logger.error({ err: error }, 'Template validation failed');
      return {
        isValid: false,
        results: [],
        summary: 'Validation failed due to an error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Enhance template data with workflow configuration defaults
   */
  private static async enhanceTemplateWithWorkflowConfig(templateData: any) {
    const enhanced = { ...templateData };
    
    // Add metadata structure if missing
    if (!enhanced.metadata) {
      enhanced.metadata = {};
    }
    
    // Ensure workflow integration structure exists with defaults
    if (!enhanced.metadata.workflowIntegration) {
      enhanced.metadata.workflowIntegration = {
        participationMode: 'executor',
        coordinationPatterns: ['sequential'],
        contextInheritance: {
          conversationHistory: 'summary',
          toolExecutions: 'results_only',
          privateData: 'filter',
          customData: {}
        },
        handoffTriggers: {
          onSuccess: 'immediate',
          onFailure: 'retry',
          onTimeout: 'extend'
        },
        stepCoordination: {
          dependencies: [],
          timeout: 300,
          retryPolicy: {
            maxRetries: 3,
            backoffMs: 1000,
            retryableErrors: ['timeout', 'network_error']
          }
        },
        performanceThresholds: {
          maxExecutionTime: 300,
          minSuccessRate: 0.8,
          maxTokenUsage: 4000
        }
      };
    }
    
    // Ensure token management structure exists with defaults
    if (!enhanced.metadata.tokenManagement) {
      enhanced.metadata.tokenManagement = {
        budgetLimits: {
          maxPerRequest: 4000,
          alertThreshold: 80
        },
        optimization: {
          enableDynamicAllocation: true,
          enablePromptCompression: false,
          enableCaching: true,
          complexityMultiplier: 1.0
        }
      };
    }
    
    // Ensure security configuration exists with defaults
    if (!enhanced.metadata.securityConfiguration) {
      enhanced.metadata.securityConfiguration = {
        requiredPermissions: [],
        dataAccessLevel: 'public',
        auditLevel: 'basic',
        complianceRequirements: []
      };
    }
    
    return enhanced;
  }

  /**
   * Categorize MCP tool for organization
   */
  private static categorizeTool(toolName: string): string {
    const toolCategories = {
      'file': ['read_file', 'write_file', 'list_files', 'file'],
      'web': ['web_search', 'fetch_url', 'scrape', 'http', 'browser'],
      'data': ['query_database', 'transform_data', 'analyze', 'sql', 'database'],
      'communication': ['send_email', 'post_message', 'notify', 'email', 'slack'],
      'workflow': ['execute_step', 'coordinate', 'handoff', 'workflow'],
      'ai': ['llm', 'generate', 'analyze_text', 'summarize', 'translate'],
      'system': ['execute_command', 'system_info', 'process', 'shell']
    };
    
    const lowerToolName = toolName.toLowerCase();
    
    for (const [category, keywords] of Object.entries(toolCategories)) {
      if (keywords.some(keyword => lowerToolName.includes(keyword))) {
        return category;
      }
    }
    
    return 'general';
  }

  /**
   * Validate basic template configuration
   */
  private static async validateBasicConfig(templateData: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!templateData.name || templateData.name.trim().length === 0) {
      errors.push('Template name is required');
    }
    
    if (!templateData.defaultRole || templateData.defaultRole.trim().length === 0) {
      errors.push('Default role is required');
    }
    
    if (!templateData.promptTemplate || templateData.promptTemplate.trim().length === 0) {
      errors.push('Prompt template is required');
    }
    
    if (!templateData.capabilities || Object.keys(templateData.capabilities).length === 0) {
      warnings.push('No capabilities defined - consider adding agent capabilities');
    }
    
    if (templateData.name && templateData.name.length > 100) {
      warnings.push('Template name is very long - consider shortening for better usability');
    }
    
    return {
      isValid: errors.length === 0,
      category: 'Basic Configuration',
      errors,
      warnings
    };
  }

  /**
   * Validate workflow integration configuration
   */
  private static async validateWorkflowIntegration(workflowConfig: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const validModes = ['coordinator', 'executor', 'reviewer', 'hybrid'];
    if (!validModes.includes(workflowConfig.participationMode)) {
      errors.push('Invalid participation mode');
    }
    
    if (workflowConfig.coordinationPatterns && workflowConfig.coordinationPatterns.length === 0) {
      warnings.push('No coordination patterns selected - agent may have limited workflow capabilities');
    }
    
    if (!workflowConfig.contextInheritance) {
      warnings.push('Context inheritance not configured - using defaults');
    }
    
    if (workflowConfig.performanceThresholds) {
      if (workflowConfig.performanceThresholds.maxExecutionTime < 30) {
        warnings.push('Very short execution timeout - may cause premature failures');
      }
      if (workflowConfig.performanceThresholds.minSuccessRate > 0.95) {
        warnings.push('Very high success rate threshold - may be difficult to achieve');
      }
    }
    
    return {
      isValid: errors.length === 0,
      category: 'Workflow Integration',
      errors,
      warnings
    };
  }

  /**
   * Validate MCP tools configuration
   */
  private static async validateMCPTools(mcpConfig: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (mcpConfig.selectedTools && mcpConfig.selectedTools.length > 0) {
      // Check for duplicate tools
      const toolNames = mcpConfig.selectedTools.map((t: any) => t.toolName);
      const duplicates = toolNames.filter((name: string, index: number) => toolNames.indexOf(name) !== index);
      
      if (duplicates.length > 0) {
        warnings.push(`Duplicate tools selected: ${duplicates.join(', ')}`);
      }
      
      // Validate tool availability (basic check)
      for (const tool of mcpConfig.selectedTools) {
        if (!tool.toolName || !tool.serverName) {
          errors.push('Invalid tool configuration - missing tool name or server name');
        }
      }
      
      if (mcpConfig.selectedTools.length > 20) {
        warnings.push('Many tools selected - consider reducing for better performance');
      }
    } else {
      warnings.push('No MCP tools selected - agent will have limited capabilities');
    }
    
    return {
      isValid: errors.length === 0,
      category: 'MCP Tools',
      errors,
      warnings
    };
  }

  /**
   * Validate token management configuration
   */
  private static async validateTokenManagement(tokenConfig: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (tokenConfig.budgetLimits) {
      if (tokenConfig.budgetLimits.maxPerRequest < 100) {
        warnings.push('Very low token limit per request - may limit agent capabilities');
      }
      
      if (tokenConfig.budgetLimits.maxPerRequest > 32000) {
        warnings.push('Very high token limit - may result in expensive API calls');
      }
      
      if (tokenConfig.budgetLimits.alertThreshold > 95) {
        warnings.push('Very high alert threshold - may not provide enough warning');
      }
    }
    
    if (tokenConfig.optimization) {
      if (tokenConfig.optimization.complexityMultiplier > 5.0) {
        warnings.push('Very high complexity multiplier - may result in excessive token usage');
      }
    }
    
    return {
      isValid: errors.length === 0,
      category: 'Token Management',
      errors,
      warnings
    };
  }

  /**
   * Generate validation summary
   */
  private static generateValidationSummary(results: any[]) {
    const totalErrors = results.reduce((sum, result) => sum + result.errors.length, 0);
    const totalWarnings = results.reduce((sum, result) => sum + result.warnings.length, 0);
    
    if (totalErrors === 0 && totalWarnings === 0) {
      return 'Template configuration is valid and ready for use';
    }
    
    if (totalErrors === 0) {
      return `Template is valid with ${totalWarnings} warning${totalWarnings !== 1 ? 's' : ''}`;
    }
    
    return `Template has ${totalErrors} error${totalErrors !== 1 ? 's' : ''} and ${totalWarnings} warning${totalWarnings !== 1 ? 's' : ''} that need attention`;
  }
}
