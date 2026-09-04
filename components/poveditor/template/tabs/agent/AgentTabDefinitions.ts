import { TemplateTab } from '../types';
import { MCPToolsTab } from './MCPToolsTab';
import { TokenManagementTab } from './TokenManagementTab';
import { PromptTemplateTab } from './PromptTemplateTab';

/**
 * Agent Template Tab Definitions
 *
 * Defines all agent-specific tabs for the TemplateEditor.
 * These tabs are registered with the TemplateTabRegistry for 'agent' template types.
 *
 * Removed in Phase 4 (dead tabs):
 * - SecurityTab (saved but never read during execution)
 * - WorkflowIntegrationTab (future feature, validation always returns valid)
 * - TestingTab (settings saved but no test runner exists)
 */

export const MCPToolsTabDef: TemplateTab = {
  id: 'agent-mcp-tools',
  label: 'MCP Tools',
  description: 'Select and configure MCP tools for this agent',
  component: MCPToolsTab,
  icon: '🔧',
  order: 110,
  templateTypes: ['agent'],
  isRequired: false,
  validation: {
    custom: (templateData: any) => {
      const errors: Record<string, string[]> = {};
      const mcpConfig = templateData?.agentConfig?.mcpToolConfiguration;

      if (mcpConfig?.selectedTools) {
        const toolNames = mcpConfig.selectedTools.map((t: any) => t.toolName);
        const duplicates = toolNames.filter((name: string, index: number) => toolNames.indexOf(name) !== index);

        if (duplicates.length > 0) {
          errors['agentConfig.mcpToolConfiguration.selectedTools'] = [`Duplicate tools selected: ${duplicates.join(', ')}`];
        }

        mcpConfig.selectedTools.forEach((tool: any, index: number) => {
          if (!tool.toolName || !tool.serverName) {
            errors[`agentConfig.mcpToolConfiguration.selectedTools.${index}`] = ['Tool name and server name are required'];
          }
        });
      }

      return {
        isValid: Object.keys(errors).length === 0,
        errors
      };
    }
  }
};

export const TokenManagementTabDef: TemplateTab = {
  id: 'agent-token-management',
  label: 'Token Management',
  description: 'Configure token budgets and optimization settings',
  component: TokenManagementTab,
  icon: '💰',
  order: 120,
  templateTypes: ['agent'],
  isRequired: false,
  validation: {
    fields: {
      'agentConfig.tokenManagement.budgetLimits.maxPerRequest': {
        minLength: 100,
        message: 'Token limit must be at least 100'
      },
      'agentConfig.tokenManagement.budgetLimits.alertThreshold': {
        minLength: 1,
        maxLength: 100,
        message: 'Alert threshold must be between 1 and 100'
      }
    },
    custom: (templateData: any) => {
      const errors: Record<string, string[]> = {};
      const tokenConfig = templateData?.agentConfig?.tokenManagement;

      if (tokenConfig?.budgetLimits) {
        const limits = tokenConfig.budgetLimits;

        if (limits.maxPerRequest > 32000) {
          errors['agentConfig.tokenManagement.budgetLimits.maxPerRequest'] = ['Token limit cannot exceed 32,000'];
        }

        if (limits.alertThreshold > 100) {
          errors['agentConfig.tokenManagement.budgetLimits.alertThreshold'] = ['Alert threshold cannot exceed 100%'];
        }

        if (limits.maxPerHour && limits.maxPerHour < limits.maxPerRequest) {
          errors['agentConfig.tokenManagement.budgetLimits.maxPerHour'] = ['Hourly limit must be greater than per-request limit'];
        }
      }

      return {
        isValid: Object.keys(errors).length === 0,
        errors
      };
    }
  }
};

export const PromptTemplateTabDef: TemplateTab = {
  id: 'agent-prompt-template',
  label: 'Prompt Template',
  description: 'Design the core prompt template that defines agent behavior',
  component: PromptTemplateTab,
  icon: '📝',
  order: 90,
  templateTypes: ['agent'],
  isRequired: false,
  validation: {
    custom: (templateData: any) => {
      const errors: Record<string, string[]> = {};
      const promptTemplate = (templateData as any)?.promptTemplate;

      if (promptTemplate && promptTemplate.length > 10000) {
        errors['promptTemplate'] = ['Prompt template is too long (max 10,000 characters)'];
      }

      return {
        isValid: Object.keys(errors).length === 0,
        errors
      };
    }
  }
};

/**
 * All agent tab definitions
 */
export const AgentTabDefinitions: TemplateTab[] = [
  PromptTemplateTabDef,
  MCPToolsTabDef,
  TokenManagementTabDef,
];
