import { tokenManager } from '@/lib/services/llm/tokenManager';
import { TemplateData, ValidationResult, ServiceResponse } from './types';
import { logger } from '@/lib/logger';

const validationLogger = logger.child({ module: 'TemplateValidationService' });

/**
 * Template Validation Service
 * 
 * Provides comprehensive template validation with detailed error reporting.
 * Handles validation of basic configuration, workflow integration, MCP tools, and security settings.
 */

export interface ValidationOptions {
  validationLevel?: 'basic' | 'comprehensive' | 'strict';
  includePerformanceChecks?: boolean;
  includeSecurityChecks?: boolean;
  includeMCPValidation?: boolean;
  includeWorkflowValidation?: boolean;
  customRules?: ValidationRule[];
}

export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: 'error' | 'warning' | 'info';
  validator: (templateData: TemplateData) => ValidationRuleResult;
}

export interface ValidationRuleResult {
  passed: boolean;
  message: string;
  details?: string;
  suggestions?: string[];
  affectedFields?: string[];
}

export interface ComprehensiveValidationResult {
  isValid: boolean;
  overallScore: number;
  categoryScores: {
    basic: number;
    workflow: number;
    mcp: number;
    security: number;
    performance: number;
  };
  results: ValidationResult[];
  summary: {
    totalChecks: number;
    passed: number;
    warnings: number;
    errors: number;
    criticalIssues: number;
  };
  recommendations: string[];
  criticalIssues: string[];
  performanceImpact: {
    estimatedTokenUsage: number;
    estimatedExecutionTime: number;
    optimizationOpportunities: string[];
  };
}

/**
 * Template Validation Service Class
 */
export class TemplateValidationService {
  private static validationRules: ValidationRule[] = [];

  /**
   * Initialize validation rules
   */
  static initializeRules() {
    this.validationRules = [
      ...this.getBasicValidationRules(),
      ...this.getWorkflowValidationRules(),
      ...this.getMCPValidationRules(),
      ...this.getSecurityValidationRules(),
      ...this.getPerformanceValidationRules()
    ];
  }

  /**
   * Comprehensive template validation
   */
  static async validateTemplate(
    templateData: TemplateData,
    options: ValidationOptions = {}
  ): Promise<ServiceResponse<ComprehensiveValidationResult>> {
    try {
      validationLogger.info({ templateName: templateData.name }, 'Starting comprehensive validation');

      // Initialize rules if not already done
      if (this.validationRules.length === 0) {
        this.initializeRules();
      }

      const validationLevel = options.validationLevel || 'comprehensive';
      const results: ValidationResult[] = [];
      const categoryScores = {
        basic: 0,
        workflow: 0,
        mcp: 0,
        security: 0,
        performance: 0
      };

      // Run basic validation
      const basicResults = await this.validateBasicConfig(templateData, options);
      results.push(...basicResults);
      categoryScores.basic = this.calculateCategoryScore(basicResults);

      // Run workflow validation if enabled
      if (options.includeWorkflowValidation !== false) {
        const workflowResults = await this.validateWorkflowIntegration(templateData, options);
        results.push(...workflowResults);
        categoryScores.workflow = this.calculateCategoryScore(workflowResults);
      }

      // Run MCP validation if enabled
      if (options.includeMCPValidation !== false) {
        const mcpResults = await this.validateMCPTools(templateData, options);
        results.push(...mcpResults);
        categoryScores.mcp = this.calculateCategoryScore(mcpResults);
      }

      // Run security validation if enabled
      if (options.includeSecurityChecks !== false) {
        const securityResults = await this.validateSecurityConfiguration(templateData, options);
        results.push(...securityResults);
        categoryScores.security = this.calculateCategoryScore(securityResults);
      }

      // Run performance validation if enabled
      if (options.includePerformanceChecks !== false) {
        const performanceResults = await this.validatePerformanceConfiguration(templateData, options);
        results.push(...performanceResults);
        categoryScores.performance = this.calculateCategoryScore(performanceResults);
      }

      // Run custom rules if provided
      if (options.customRules && options.customRules.length > 0) {
        const customResults = this.runCustomValidationRules(templateData, options.customRules);
        results.push(...customResults);
      }

      // Calculate summary statistics
      const summary = this.calculateValidationSummary(results);
      const overallScore = this.calculateOverallScore(categoryScores, results);
      const isValid = summary.errors === 0 && summary.criticalIssues === 0;

      // Generate recommendations and identify critical issues
      const recommendations = this.generateRecommendations(templateData, results);
      const criticalIssues = this.identifyCriticalIssues(results);

      // Calculate performance impact
      const performanceImpact = this.calculatePerformanceImpact(templateData, results);

      const validationResult: ComprehensiveValidationResult = {
        isValid,
        overallScore,
        categoryScores,
        results,
        summary,
        recommendations,
        criticalIssues,
        performanceImpact
      };

      validationLogger.info({ overallScore, isValid }, 'Validation completed');
      return { success: true, data: validationResult };

    } catch (error) {
      validationLogger.error({ err: error }, 'Validation failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Validation failed'
      };
    }
  }

  /**
   * Validate basic template configuration
   */
  static async validateBasicConfig(
    templateData: TemplateData,
    options: ValidationOptions
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    // Template name validation
    if (!templateData.name || templateData.name.trim().length === 0) {
      results.push({
        isValid: false,
        category: 'Basic Configuration',
        errors: ['Template name is required'],
        warnings: []
      });
    } else if (templateData.name.length > 100) {
      results.push({
        isValid: true,
        category: 'Basic Configuration',
        errors: [],
        warnings: ['Template name is very long (>100 characters). Consider shortening for better usability.']
      });
    }

    // Default role validation
    if (!templateData.defaultRole || templateData.defaultRole.trim().length === 0) {
      results.push({
        isValid: false,
        category: 'Basic Configuration',
        errors: ['Default role is required'],
        warnings: []
      });
    }

    // Prompt template validation
    if (!templateData.promptTemplate || templateData.promptTemplate.trim().length === 0) {
      results.push({
        isValid: false,
        category: 'Basic Configuration',
        errors: ['Prompt template is required'],
        warnings: []
      });
    } else {
      const promptLength = templateData.promptTemplate.length;
      if (promptLength < 50) {
        results.push({
          isValid: true,
          category: 'Basic Configuration',
          errors: [],
          warnings: ['Prompt template is very short. Consider adding more detailed instructions.']
        });
      } else if (promptLength > 4000) {
        results.push({
          isValid: true,
          category: 'Basic Configuration',
          errors: [],
          warnings: ['Prompt template is very long. This may impact token usage and performance.']
        });
      }

      // Check for template variables
      const hasVariables = /\{[^}]+\}/.test(templateData.promptTemplate);
      if (!hasVariables) {
        results.push({
          isValid: true,
          category: 'Basic Configuration',
          errors: [],
          warnings: ['No template variables found. Consider adding variables like {input} or {context} for flexibility.']
        });
      }
    }

    // Capabilities validation
    if (!templateData.capabilities || Object.keys(templateData.capabilities).length === 0) {
      results.push({
        isValid: true,
        category: 'Basic Configuration',
        errors: [],
        warnings: ['No capabilities defined. Consider adding agent capabilities for better functionality.']
      });
    } else if (Object.keys(templateData.capabilities).length > 15) {
      results.push({
        isValid: true,
        category: 'Basic Configuration',
        errors: [],
        warnings: ['Many capabilities defined (>15). Consider grouping or reducing for better focus.']
      });
    }

    // Constraints validation
    if (templateData.constraints && Object.keys(templateData.constraints).length > 20) {
      results.push({
        isValid: true,
        category: 'Basic Configuration',
        errors: [],
        warnings: ['Many constraints defined (>20). Consider simplifying for better performance.']
      });
    }

    // Category validation
    if (!templateData.category || templateData.category.trim().length === 0) {
      results.push({
        isValid: false,
        category: 'Basic Configuration',
        errors: ['Template category is required'],
        warnings: []
      });
    }

    return results;
  }

  /**
   * Validate workflow integration configuration
   */
  static async validateWorkflowIntegration(
    templateData: TemplateData,
    options: ValidationOptions
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    const workflowConfig = templateData.metadata?.workflowIntegration;

    if (!workflowConfig) {
      results.push({
        isValid: true,
        category: 'Workflow Integration',
        errors: [],
        warnings: ['No workflow integration configuration found. Template will use default settings.']
      });
      return results;
    }

    // Participation mode validation
    const validModes = ['coordinator', 'executor', 'reviewer', 'hybrid'];
    if (!workflowConfig.participationMode) {
      results.push({
        isValid: false,
        category: 'Workflow Integration',
        errors: ['Participation mode is required'],
        warnings: []
      });
    } else if (!validModes.includes(workflowConfig.participationMode)) {
      results.push({
        isValid: false,
        category: 'Workflow Integration',
        errors: [`Invalid participation mode: ${workflowConfig.participationMode}. Must be one of: ${validModes.join(', ')}`],
        warnings: []
      });
    }

    // Coordination patterns validation
    if (!workflowConfig.coordinationPatterns || workflowConfig.coordinationPatterns.length === 0) {
      results.push({
        isValid: true,
        category: 'Workflow Integration',
        errors: [],
        warnings: ['No coordination patterns configured. Agent may have limited workflow capabilities.']
      });
    } else {
      const validPatterns = ['sequential', 'parallel', 'hierarchical'];
      const invalidPatterns = workflowConfig.coordinationPatterns.filter(
        (pattern: string) => !validPatterns.includes(pattern)
      );
      if (invalidPatterns.length > 0) {
        results.push({
          isValid: false,
          category: 'Workflow Integration',
          errors: [`Invalid coordination patterns: ${invalidPatterns.join(', ')}`],
          warnings: []
        });
      }
    }

    // Context inheritance validation
    if (!workflowConfig.contextInheritance) {
      results.push({
        isValid: true,
        category: 'Workflow Integration',
        errors: [],
        warnings: ['Context inheritance not configured. Using default settings.']
      });
    } else {
      const contextConfig = workflowConfig.contextInheritance;
      if (!contextConfig.conversationHistory || !contextConfig.toolExecutions) {
        results.push({
          isValid: true,
          category: 'Workflow Integration',
          errors: [],
          warnings: ['Incomplete context inheritance configuration. Some context may not be preserved.']
        });
      }
    }

    // Performance thresholds validation
    if (workflowConfig.performanceThresholds) {
      const thresholds = workflowConfig.performanceThresholds;
      
      if (thresholds.maxExecutionTime && thresholds.maxExecutionTime < 30000) {
        results.push({
          isValid: true,
          category: 'Workflow Integration',
          errors: [],
          warnings: ['Very short execution timeout (<30s) may cause premature workflow failures.']
        });
      }
      
      if (thresholds.minSuccessRate && thresholds.minSuccessRate > 0.95) {
        results.push({
          isValid: true,
          category: 'Workflow Integration',
          errors: [],
          warnings: ['Very high success rate threshold (>95%) may be difficult to achieve consistently.']
        });
      }
      
      if (thresholds.maxTokenUsage && thresholds.maxTokenUsage > 10000) {
        results.push({
          isValid: true,
          category: 'Workflow Integration',
          errors: [],
          warnings: ['Very high token usage threshold (>10k) may result in expensive operations.']
        });
      }
    }

    return results;
  }

  /**
   * Validate MCP tools configuration
   */
  static async validateMCPTools(
    templateData: TemplateData,
    options: ValidationOptions
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    const mcpConfig = templateData.metadata?.mcpToolConfiguration;

    if (!mcpConfig || !mcpConfig.selectedTools || mcpConfig.selectedTools.length === 0) {
      results.push({
        isValid: true,
        category: 'MCP Tools',
        errors: [],
        warnings: ['No MCP tools selected. Agent will have limited external capabilities.']
      });
      return results;
    }

    const selectedTools = mcpConfig.selectedTools;

    // Check for duplicate tools
    const toolNames = selectedTools.map((t: any) => `${t.serverName}:${t.toolName}`);
    const duplicates = toolNames.filter((name: string, index: number) => toolNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      results.push({
        isValid: true,
        category: 'MCP Tools',
        errors: [],
        warnings: [`Duplicate tools detected: ${[...new Set(duplicates)].join(', ')}`]
      });
    }

    // Validate tool count
    if (selectedTools.length > 15) {
      results.push({
        isValid: true,
        category: 'MCP Tools',
        errors: [],
        warnings: [`Many tools selected (${selectedTools.length}). Consider reducing for better performance.`]
      });
    }

    // Validate tool availability using API endpoint
    try {
      const response = await fetch('/api/agent-templates/builder?action=discover-tools');
      const result = await response.json();
      
      if (result.success) {
        const availableTools = result.data.tools || [];
        const unavailableTools = [];

        for (const tool of selectedTools) {
          if (!tool.toolName || !tool.serverName) {
            results.push({
              isValid: false,
              category: 'MCP Tools',
              errors: ['Invalid tool configuration: missing tool name or server name'],
              warnings: []
            });
            continue;
          }

          const isAvailable = availableTools.some((t: any) => 
            t.toolName === tool.toolName && t.serverName === tool.serverName
          );
          
          if (!isAvailable) {
            unavailableTools.push(`${tool.serverName}:${tool.toolName}`);
          }
        }

        if (unavailableTools.length > 0) {
          results.push({
            isValid: false,
            category: 'MCP Tools',
            errors: [`Tools not available: ${unavailableTools.join(', ')}`],
            warnings: []
          });
        }
      } else {
        results.push({
          isValid: true,
          category: 'MCP Tools',
          errors: [],
          warnings: ['Cannot validate tool availability - MCP service unavailable.']
        });
      }
    } catch (error) {
      results.push({
        isValid: true,
        category: 'MCP Tools',
        errors: [],
        warnings: ['Cannot validate tool availability - API error.']
      });
    }

    // Validate tool coordination settings
    if (mcpConfig.toolCoordination) {
      const coordination = mcpConfig.toolCoordination;
      
      if (coordination.conflictResolution && !['first_wins', 'last_wins', 'merge', 'error'].includes(coordination.conflictResolution)) {
        results.push({
          isValid: false,
          category: 'MCP Tools',
          errors: ['Invalid conflict resolution strategy'],
          warnings: []
        });
      }
    }

    return results;
  }

  /**
   * Validate security configuration
   */
  static async validateSecurityConfiguration(
    templateData: TemplateData,
    options: ValidationOptions
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    const securityConfig = templateData.metadata?.securityConfiguration;

    if (!securityConfig) {
      results.push({
        isValid: true,
        category: 'Security',
        errors: [],
        warnings: ['No security configuration found. Using default security settings.']
      });
      return results;
    }

    // Data access level validation
    const validAccessLevels = ['public', 'internal', 'confidential', 'restricted'];
    if (!securityConfig.dataAccessLevel) {
      results.push({
        isValid: false,
        category: 'Security',
        errors: ['Data access level is required'],
        warnings: []
      });
    } else if (!validAccessLevels.includes(securityConfig.dataAccessLevel)) {
      results.push({
        isValid: false,
        category: 'Security',
        errors: [`Invalid data access level: ${securityConfig.dataAccessLevel}`],
        warnings: []
      });
    }

    // Audit level validation
    const validAuditLevels = ['none', 'basic', 'detailed', 'comprehensive'];
    if (securityConfig.auditLevel && !validAuditLevels.includes(securityConfig.auditLevel)) {
      results.push({
        isValid: false,
        category: 'Security',
        errors: [`Invalid audit level: ${securityConfig.auditLevel}`],
        warnings: []
      });
    }

    // Permissions validation
    if (securityConfig.requiredPermissions && securityConfig.requiredPermissions.length === 0) {
      results.push({
        isValid: true,
        category: 'Security',
        errors: [],
        warnings: ['No required permissions specified. Agent may have unrestricted access.']
      });
    }

    // Compliance validation
    if (securityConfig.complianceRequirements && securityConfig.complianceRequirements.length > 0) {
      const validCompliance = ['GDPR', 'HIPAA', 'SOC2', 'ISO27001', 'PCI_DSS', 'CCPA', 'FERPA', 'COPPA'];
      const invalidCompliance = securityConfig.complianceRequirements.filter(
        (req: string) => !validCompliance.includes(req)
      );
      
      if (invalidCompliance.length > 0) {
        results.push({
          isValid: false,
          category: 'Security',
          errors: [`Invalid compliance requirements: ${invalidCompliance.join(', ')}`],
          warnings: []
        });
      }

      // Check for conflicting compliance requirements
      if (securityConfig.complianceRequirements.includes('HIPAA') && securityConfig.dataAccessLevel === 'public') {
        results.push({
          isValid: false,
          category: 'Security',
          errors: ['HIPAA compliance requires restricted data access, but access level is set to public'],
          warnings: []
        });
      }
    }

    return results;
  }

  /**
   * Validate performance configuration
   */
  static async validatePerformanceConfiguration(
    templateData: TemplateData,
    options: ValidationOptions
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    const tokenConfig = templateData.metadata?.tokenManagement;

    // Token management validation
    if (!tokenConfig) {
      results.push({
        isValid: true,
        category: 'Performance',
        errors: [],
        warnings: ['No token management configuration. Using default settings.']
      });
    } else {
      if (tokenConfig.budgetLimits) {
        const limits = tokenConfig.budgetLimits;
        
        if (limits.maxPerRequest && limits.maxPerRequest < 100) {
          results.push({
            isValid: true,
            category: 'Performance',
            errors: [],
            warnings: ['Very low token limit per request (<100). May limit agent capabilities.']
          });
        }
        
        if (limits.maxPerRequest && limits.maxPerRequest > 32000) {
          results.push({
            isValid: true,
            category: 'Performance',
            errors: [],
            warnings: ['Very high token limit per request (>32k). May result in expensive API calls.']
          });
        }
        
        if (limits.alertThreshold && limits.alertThreshold > 95) {
          results.push({
            isValid: true,
            category: 'Performance',
            errors: [],
            warnings: ['Very high alert threshold (>95%). May not provide sufficient warning.']
          });
        }
      }

      if (tokenConfig.optimization) {
        const optimization = tokenConfig.optimization;
        
        if (optimization.complexityMultiplier && optimization.complexityMultiplier > 3.0) {
          results.push({
            isValid: true,
            category: 'Performance',
            errors: [],
            warnings: ['High complexity multiplier (>3.0). May result in excessive token usage.']
          });
        }
      }
    }

    // Estimate token usage
    const estimatedTokens = this.estimateTokenUsage(templateData);
    if (estimatedTokens > 8000) {
      results.push({
        isValid: true,
        category: 'Performance',
        errors: [],
        warnings: [`High estimated token usage (${estimatedTokens}). Consider optimization.`]
      });
    }

    return results;
  }

  // Helper methods

  private static getBasicValidationRules(): ValidationRule[] {
    return [
      {
        id: 'name_required',
        name: 'Template Name Required',
        description: 'Template must have a non-empty name',
        category: 'basic',
        severity: 'error',
        validator: (template) => ({
          passed: !!(template.name && template.name.trim()),
          message: template.name ? 'Template name is valid' : 'Template name is required'
        })
      },
      {
        id: 'prompt_required',
        name: 'Prompt Template Required',
        description: 'Template must have a prompt template',
        category: 'basic',
        severity: 'error',
        validator: (template) => ({
          passed: !!(template.promptTemplate && template.promptTemplate.trim()),
          message: template.promptTemplate ? 'Prompt template is valid' : 'Prompt template is required'
        })
      }
    ];
  }

  private static getWorkflowValidationRules(): ValidationRule[] {
    return [
      {
        id: 'participation_mode_valid',
        name: 'Valid Participation Mode',
        description: 'Participation mode must be valid',
        category: 'workflow',
        severity: 'error',
        validator: (template) => {
          const mode = template.metadata?.workflowIntegration?.participationMode;
          const validModes = ['coordinator', 'executor', 'reviewer', 'hybrid'];
          return {
            passed: !mode || validModes.includes(mode),
            message: validModes.includes(mode || '') ? 'Participation mode is valid' : 'Invalid participation mode'
          };
        }
      }
    ];
  }

  private static getMCPValidationRules(): ValidationRule[] {
    return [
      {
        id: 'mcp_tools_valid',
        name: 'Valid MCP Tools',
        description: 'MCP tools must have valid configuration',
        category: 'mcp',
        severity: 'warning',
        validator: (template) => {
          const tools = template.metadata?.mcpToolConfiguration?.selectedTools || [];
          const hasInvalidTools = tools.some((tool: any) => !tool.toolName || !tool.serverName);
          return {
            passed: !hasInvalidTools,
            message: hasInvalidTools ? 'Some MCP tools have invalid configuration' : 'MCP tools are valid'
          };
        }
      }
    ];
  }

  private static getSecurityValidationRules(): ValidationRule[] {
    return [
      {
        id: 'data_access_level_valid',
        name: 'Valid Data Access Level',
        description: 'Data access level must be valid',
        category: 'security',
        severity: 'error',
        validator: (template) => {
          const level = template.metadata?.securityConfiguration?.dataAccessLevel;
          const validLevels = ['public', 'internal', 'confidential', 'restricted'];
          return {
            passed: !level || validLevels.includes(level),
            message: validLevels.includes(level || '') ? 'Data access level is valid' : 'Invalid data access level'
          };
        }
      }
    ];
  }

  private static getPerformanceValidationRules(): ValidationRule[] {
    return [
      {
        id: 'token_limits_reasonable',
        name: 'Reasonable Token Limits',
        description: 'Token limits should be reasonable',
        category: 'performance',
        severity: 'warning',
        validator: (template) => {
          const limit = template.metadata?.tokenManagement?.budgetLimits?.maxPerRequest;
          const isReasonable = !limit || (limit >= 100 && limit <= 16000);
          return {
            passed: isReasonable,
            message: isReasonable ? 'Token limits are reasonable' : 'Token limits may be too high or too low'
          };
        }
      }
    ];
  }

  private static runCustomValidationRules(templateData: TemplateData, rules: ValidationRule[]): ValidationResult[] {
    const results: ValidationResult[] = [];
    
    for (const rule of rules) {
      try {
        const ruleResult = rule.validator(templateData);
        results.push({
          isValid: ruleResult.passed,
          category: `Custom - ${rule.category}`,
          errors: ruleResult.passed ? [] : [ruleResult.message],
          warnings: ruleResult.passed && rule.severity === 'warning' ? [ruleResult.message] : []
        });
      } catch (error) {
        results.push({
          isValid: false,
          category: 'Custom Rules',
          errors: [`Custom rule '${rule.name}' failed to execute`],
          warnings: []
        });
      }
    }
    
    return results;
  }

  private static calculateCategoryScore(results: ValidationResult[]): number {
    if (results.length === 0) return 100;
    
    const totalChecks = results.length;
    const passedChecks = results.filter(r => r.isValid && r.errors.length === 0).length;
    
    return Math.round((passedChecks / totalChecks) * 100);
  }

  private static calculateValidationSummary(results: ValidationResult[]) {
    const totalChecks = results.length;
    const passed = results.filter(r => r.isValid && r.errors.length === 0).length;
    const errors = results.reduce((sum, r) => sum + r.errors.length, 0);
    const warnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
    const criticalIssues = results.filter(r => !r.isValid && r.errors.some(e => 
      e.toLowerCase().includes('required') || e.toLowerCase().includes('invalid')
    )).length;

    return { totalChecks, passed, warnings, errors, criticalIssues };
  }

  private static calculateOverallScore(categoryScores: any, results: ValidationResult[]): number {
    const scores = Object.values(categoryScores) as number[];
    const validScores = scores.filter(score => score > 0);
    
    if (validScores.length === 0) return 0;
    
    const averageScore = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
    
    // Penalize for critical errors
    const criticalErrors = results.filter(r => !r.isValid).length;
    const penalty = Math.min(criticalErrors * 10, 50); // Max 50% penalty
    
    return Math.max(0, Math.round(averageScore - penalty));
  }

  private static generateRecommendations(templateData: TemplateData, results: ValidationResult[]): string[] {
    const recommendations: string[] = [];
    
    // Analyze results and generate recommendations
    const hasErrors = results.some(r => r.errors.length > 0);
    const hasWarnings = results.some(r => r.warnings.length > 0);
    
    if (hasErrors) {
      recommendations.push('Address all validation errors before deploying this template');
    }
    
    if (hasWarnings) {
      recommendations.push('Review validation warnings to improve template quality');
    }
    
    // Specific recommendations based on template analysis
    const promptLength = templateData.promptTemplate?.length || 0;
    if (promptLength > 3000) {
      recommendations.push('Consider breaking down the prompt template for better maintainability');
    }
    
    const toolCount = templateData.metadata?.mcpToolConfiguration?.selectedTools?.length || 0;
    if (toolCount > 10) {
      recommendations.push('Consider reducing the number of MCP tools for better performance');
    }
    
    return recommendations;
  }

  private static identifyCriticalIssues(results: ValidationResult[]): string[] {
    const criticalIssues: string[] = [];
    
    for (const result of results) {
      for (const error of result.errors) {
        if (error.toLowerCase().includes('required') || 
            error.toLowerCase().includes('invalid') ||
            error.toLowerCase().includes('security') ||
            error.toLowerCase().includes('compliance')) {
          criticalIssues.push(`${result.category}: ${error}`);
        }
      }
    }
    
    return criticalIssues;
  }

  private static calculatePerformanceImpact(templateData: TemplateData, results: ValidationResult[]) {
    const estimatedTokenUsage = this.estimateTokenUsage(templateData);
    const estimatedExecutionTime = this.estimateExecutionTime(templateData);
    const optimizationOpportunities = this.identifyOptimizationOpportunities(templateData, results);

    return {
      estimatedTokenUsage,
      estimatedExecutionTime,
      optimizationOpportunities
    };
  }

  private static estimateTokenUsage(templateData: TemplateData): number {
    const promptLength = templateData.promptTemplate?.length || 0;
    const capabilitiesLength = JSON.stringify(templateData.capabilities || {}).length;
    const constraintsLength = JSON.stringify(templateData.constraints || {}).length;
    
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil((promptLength + capabilitiesLength + constraintsLength) / 4);
  }

  private static estimateExecutionTime(templateData: TemplateData): number {
    const baseTime = 1000; // 1 second base
    const promptComplexity = (templateData.promptTemplate?.length || 0) / 100;
    const toolCount = templateData.metadata?.mcpToolConfiguration?.selectedTools?.length || 0;
    const capabilityCount = Object.keys(templateData.capabilities || {}).length;
    
    return Math.round(baseTime + (promptComplexity * 100) + (toolCount * 200) + (capabilityCount * 50));
  }

  private static identifyOptimizationOpportunities(templateData: TemplateData, results: ValidationResult[]): string[] {
    const opportunities: string[] = [];
    
    // Check for high token usage
    const estimatedTokens = this.estimateTokenUsage(templateData);
    if (estimatedTokens > 4000) {
      opportunities.push('High token usage detected - consider prompt optimization');
    }
    
    // Check for many tools
    const toolCount = templateData.metadata?.mcpToolConfiguration?.selectedTools?.length || 0;
    if (toolCount > 8) {
      opportunities.push('Many MCP tools selected - consider reducing for better performance');
    }
    
    // Check for long prompt
    const promptLength = templateData.promptTemplate?.length || 0;
    if (promptLength > 3000) {
      opportunities.push('Long prompt template - consider compression or restructuring');
    }
    
    // Check for many capabilities
    const capabilityCount = Object.keys(templateData.capabilities || {}).length;
    if (capabilityCount > 10) {
      opportunities.push('Many capabilities defined - consider grouping or reducing');
    }
    
    // Check validation results for specific opportunities
    const hasWarnings = results.some(r => r.warnings.length > 0);
    if (hasWarnings) {
      opportunities.push('Validation warnings present - address for better quality');
    }
    
    return opportunities;
  }
}
