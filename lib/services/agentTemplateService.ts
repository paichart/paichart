import logger from '@/lib/logger';
import { prisma } from '../prisma';
import { AgentCategory, AgentPriority, AgentTemplateStatus, AgentComplexity, Prisma, TemplateType } from '@prisma/client';
import {
  applyTemplateSafe,
  detectPromptInjection,
  validateTemplateVariables,
  InjectionDetectionResult
} from '@/lib/security/prompt-injection-prevention';

/**
 * Agent Template Configuration Interface
 */
export interface AgentTemplateConfig {
  name: string;
  description?: string;
  category: AgentCategory;
  templateType?: TemplateType;
  defaultRole: string;
  promptTemplate: string;
  capabilities: Record<string, any>;
  constraints: Record<string, any>;
  maxRetries?: number;
  timeout?: number;
  priority?: AgentPriority;
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
  contextTemplate?: Record<string, any>;
  metadata?: Record<string, any>;
  version?: string;
  status?: AgentTemplateStatus;
  isDefault?: boolean;
  tags?: string[];
}

/**
 * Agent Template Application Result
 */
export interface AgentTemplateApplication {
  success: boolean;
  templateId: string;
  appliedConfig: Record<string, any>;
  generatedPrompt: string;
  context: Record<string, any>;
  validationResults: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
  performance: {
    estimatedExecutionTime: number;
    complexityScore: number;
    confidenceLevel: number;
  };
}

/**
 * Prompt Generation Context
 */
export interface PromptGenerationContext {
  taskId?: string;
  povId?: string;
  phaseId?: string;
  variables: Record<string, any>;
  userContext?: Record<string, any>;
  systemContext?: Record<string, any>;
}

/**
 * Agent Template Validation Result
 */
export interface AgentTemplateValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  compatibilityScore: number;
  performanceScore: number;
}

/**
 * Agent Template Service
 * Handles all agent template operations including creation, validation, application, and optimization
 */
export class AgentTemplateService {

  /**
   * Create a new agent template
   */
  static async createTemplate(config: AgentTemplateConfig, createdBy?: string): Promise<string> {
    logger.info({ templateName: config.name, category: config.category }, 'Creating agent template');

    // REFACTOR TRACKING: Log if metadata contains agentConfig
    if (config.metadata?.agentConfig) {
      logger.warn({ templateName: config.name, agentConfigKeys: Object.keys(config.metadata.agentConfig) }, 'Template uses legacy metadata.agentConfig structure');
    }

    try {
      // Validate template configuration
      const validation = await this.validateTemplateConfig(config);
      if (!validation.isValid) {
        throw new Error(`Template validation failed: ${validation.errors.join(', ')}`);
      }

      // Create template in database
      const template = await prisma.agentTemplate.create({
        data: {
          name: config.name,
          description: config.description,
          category: config.category,
          templateType: config.templateType,
          defaultRole: config.defaultRole,
          promptTemplate: config.promptTemplate,
          capabilities: config.capabilities,
          constraints: config.constraints,
          maxRetries: config.maxRetries ?? 3,
          timeout: config.timeout ?? 300,
          priority: config.priority || AgentPriority.MEDIUM,
          inputSchema: config.inputSchema,
          outputSchema: config.outputSchema,
          contextTemplate: config.contextTemplate,
          metadata: config.metadata,
          version: config.version || '1.0.0',
          status: config.status || AgentTemplateStatus.ACTIVE,
          isDefault: config.isDefault || false,
          tags: config.tags || [],
          createdBy
        }
      });

      logger.info({ templateId: template.id }, 'Template created successfully');
      return template.id;
    } catch (error) {
      logger.error({ err: error }, 'Failed to create template');
      throw error;
    }
  }

  /**
   * Apply agent template to a task
   */
  static async applyAgentTemplate(
    templateId: string,
    taskId: string,
    context: PromptGenerationContext
  ): Promise<AgentTemplateApplication> {
    logger.info({ templateId, taskId }, 'Applying template to task');

    try {
      // Parallel query optimization (Dec 2025 - 2 independent queries → ~50% faster)
      const [template, task] = await Promise.all([
        // Get template
        prisma.agentTemplate.findUnique({
          where: { id: templateId }
        }),
        // Get task context
        prisma.task.findUnique({
          where: { id: taskId },
          include: {
            pov: true,
            phase: true,
            assignee: true
          }
        })
      ]);

      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      // Generate enhanced context
      const enhancedContext = await this.generateTaskContext(task, template, context);

      // Generate prompt from template
      const generatedPrompt = await this.generatePromptFromTemplate(
        template.promptTemplate,
        enhancedContext
      );

      // Validate configuration compatibility
      const validation = await this.validateAgentConfig(template, task, enhancedContext);

      // Calculate performance metrics
      const performance = await this.calculatePerformanceMetrics(template, task, enhancedContext);

      // Apply template to task
      await prisma.task.update({
        where: { id: taskId },
        data: {
          agentTemplateId: templateId,
          agentRole: template.defaultRole,
          prompt: generatedPrompt,
          inputContext: enhancedContext,
          maxRetries: template.maxRetries,
          timeout: template.timeout
        }
      });

      // Update template usage statistics
      await this.updateTemplateUsage(templateId);

      const result: AgentTemplateApplication = {
        success: true,
        templateId,
        appliedConfig: {
          role: template.defaultRole,
          capabilities: template.capabilities,
          constraints: template.constraints,
          priority: template.priority,
          maxRetries: template.maxRetries,
          timeout: template.timeout
        },
        generatedPrompt,
        context: enhancedContext,
        validationResults: validation,
        performance
      };

      logger.info({ templateId, taskId }, 'Template applied to task successfully');
      return result;
    } catch (error) {
      logger.error({ err: error, templateId, taskId }, 'Failed to apply template to task');
      throw error;
    }
  }

  /**
   * Validate agent configuration
   */
  static async validateAgentConfig(
    template: any,
    task: any,
    context: Record<string, any>
  ): Promise<AgentTemplateValidation> {
    logger.debug('Validating agent configuration');

    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    try {
      // Validate template structure
      if (!template.promptTemplate || template.promptTemplate.trim().length === 0) {
        errors.push('Prompt template is required and cannot be empty');
      }

      if (!template.defaultRole || template.defaultRole.trim().length === 0) {
        errors.push('Default role is required and cannot be empty');
      }

      // Validate capabilities
      if (!template.capabilities || Object.keys(template.capabilities).length === 0) {
        warnings.push('No capabilities defined - agent may have limited functionality');
      }

      // Validate task compatibility
      if (task.type && template.category) {
        const compatibleCategories = this.getCompatibleCategories(task.type);
        if (!compatibleCategories.includes(template.category)) {
          warnings.push(`Template category ${template.category} may not be optimal for task type ${task.type}`);
          suggestions.push(`Consider using a template with category: ${compatibleCategories.join(', ')}`);
        }
      }

      // Validate context requirements
      if (template.inputSchema) {
        const missingFields = this.validateInputSchema(template.inputSchema, context);
        if (missingFields.length > 0) {
          warnings.push(`Missing required context fields: ${missingFields.join(', ')}`);
        }
      }

      // Validate timeout and retry settings
      if (template.timeout && template.timeout < 30) {
        warnings.push('Timeout is very low (< 30s) - may cause premature failures');
      }

      if (template.maxRetries && template.maxRetries > 5) {
        warnings.push('High retry count (> 5) - may cause excessive delays');
      }

      // Calculate compatibility score
      const compatibilityScore = this.calculateCompatibilityScore(template, task, errors, warnings);

      // Calculate performance score
      const performanceScore = this.calculatePerformanceScore(template, context);

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        suggestions,
        compatibilityScore,
        performanceScore
      };
    } catch (error) {
      logger.error({ err: error }, 'Agent config validation error');
      return {
        isValid: false,
        errors: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings,
        suggestions,
        compatibilityScore: 0,
        performanceScore: 0
      };
    }
  }

  /**
   * Generate agent prompt from template
   */
  static async generateAgentPrompt(
    templateId: string,
    context: PromptGenerationContext
  ): Promise<string> {
    logger.debug({ templateId }, 'Generating prompt from template');

    try {
      const template = await prisma.agentTemplate.findUnique({
        where: { id: templateId }
      });

      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      return await this.generatePromptFromTemplate(template.promptTemplate, context.variables);
    } catch (error) {
      logger.error({ err: error, templateId }, 'Failed to generate prompt');
      throw error;
    }
  }

  /**
   * Get a single agent template by ID with validation
   */
  static async getTemplateById(templateId: string): Promise<any> {
    logger.debug({ templateId }, 'Getting template by ID');
    
    try {
      const template = await prisma.agentTemplate.findUnique({
        where: { id: templateId }
      });
      
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }
      
      // REFACTOR VALIDATION: Check for legacy structure
      if (template.metadata && typeof template.metadata === 'object') {
        const metadata = template.metadata as any;
        if (metadata.agentConfig) {
          logger.warn({ templateId: template.id, agentConfigKeys: Object.keys(metadata.agentConfig) }, 'Template has legacy metadata.agentConfig structure');
        }
      }
      
      return template;
    } catch (error) {
      logger.error({ err: error, templateId }, 'Failed to get template');
      throw error;
    }
  }

  /**
   * Get agent templates by category
   */
  static async getTemplatesByCategory(
    category: AgentCategory,
    includeInactive: boolean = false
  ): Promise<any[]> {
    logger.debug({ category }, 'Getting templates by category');

    try {
      const whereClause: any = { category };
      
      if (!includeInactive) {
        whereClause.status = AgentTemplateStatus.ACTIVE;
      }

      const templates = await prisma.agentTemplate.findMany({
        where: whereClause,
        orderBy: [
          { isDefault: 'desc' },
          { usageCount: 'desc' },
          { successRate: 'desc' },
          { name: 'asc' }
        ],
        take: 100,
      });

      logger.debug({ category, count: templates.length }, 'Templates fetched by category');
      return templates;
    } catch (error) {
      logger.error({ err: error, category }, 'Failed to get templates by category');
      throw error;
    }
  }

  /**
   * Get recommended templates for a task
   */
  static async getRecommendedTemplates(taskId: string, limit: number = 5): Promise<any[]> {
    logger.debug({ taskId, limit }, 'Getting recommended templates for task');

    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          pov: true,
          phase: true
        }
      });

      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      // Get compatible categories
      const compatibleCategories = this.getCompatibleCategories(task.type);

      // Find templates with high success rates in compatible categories
      const templates = await prisma.agentTemplate.findMany({
        where: {
          category: { in: compatibleCategories },
          status: AgentTemplateStatus.ACTIVE
        },
        orderBy: [
          { successRate: 'desc' },
          { usageCount: 'desc' },
          { isDefault: 'desc' }
        ],
        take: limit
      });

      logger.debug({ taskId, count: templates.length }, 'Recommended templates fetched');
      return templates;
    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to get recommended templates');
      throw error;
    }
  }

  /**
   * Update template performance metrics
   */
  static async updateTemplatePerformance(
    templateId: string,
    executionTime: number,
    success: boolean
  ): Promise<void> {
    logger.debug({ templateId, executionTime, success }, 'Updating template performance');

    try {
      // BC19/BC47 (2026-06-09): atomic running-average update — was an RR findUnique→recompute→update, the
      // hottest abort-storm site (every execution completion of same-template tasks serialized on one row).
      // The averages are now computed IN-SQL referencing the stored columns, so concurrent completions never
      // abort and never need retry. Behavior-equivalent to the prior JS for self-generated data; it intentionally
      // drops the JS `Math.round(totalExecutions*rate/100)` integer reconstruction (strictly more correct on
      // seeded/imported rows) — do NOT re-add the round(). `"usageCount"` on the RHS is the pre-increment value.
      // See transaction-atomicity-pattern.md / BC19.
      const successInc = success ? 1 : 0;
      const affected = await prisma.$executeRaw`
        UPDATE "agent_templates" SET
          "usageCount"  = "usageCount" + 1,
          "successRate" = ((COALESCE("successRate", 0) / 100.0 * "usageCount") + ${successInc}) / ("usageCount" + 1) * 100,
          "averageTime" = (COALESCE("averageTime", 0) * "usageCount" + ${executionTime}) / ("usageCount" + 1)
        WHERE id = ${templateId}`;
      if (affected === 0) {
        throw new Error(`Template not found: ${templateId}`);
      }

      logger.debug({ templateId }, 'Template performance updated');
    } catch (error) {
      logger.error({ err: error, templateId }, 'Failed to update template performance');
      throw error;
    }
  }

  // Private helper methods

  private static async validateTemplateConfig(config: AgentTemplateConfig): Promise<AgentTemplateValidation> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (!config.name || config.name.trim().length === 0) {
      errors.push('Template name is required');
    }

    if (!config.defaultRole || config.defaultRole.trim().length === 0) {
      errors.push('Default role is required');
    }

    if (!config.promptTemplate || config.promptTemplate.trim().length === 0) {
      errors.push('Prompt template is required');
    }

    if (!config.capabilities || Object.keys(config.capabilities).length === 0) {
      warnings.push('No capabilities defined');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      compatibilityScore: 100,
      performanceScore: 100
    };
  }

  private static async generateTaskContext(task: any, template: any, context: PromptGenerationContext): Promise<Record<string, any>> {
    return {
      ...context.variables,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        type: task.type,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate
      },
      pov: task.pov ? {
        id: task.pov.id,
        title: task.pov.title,
        description: task.pov.description,
        status: task.pov.status
      } : null,
      phase: task.phase ? {
        id: task.phase.id,
        name: task.phase.name,
        type: task.phase.type
      } : null,
      assignee: task.assignee ? {
        id: task.assignee.id,
        name: task.assignee.name
      } : null,
      template: {
        role: template.defaultRole,
        capabilities: template.capabilities,
        constraints: template.constraints
      },
      timestamp: new Date().toISOString(),
      ...context.userContext,
      ...context.systemContext
    };
  }

  private static async generatePromptFromTemplate(promptTemplate: string, variables: Record<string, any>): Promise<string> {
    // ✅ CRITICAL FIX: Use safe template application with injection prevention (Week 5 Task 1.3)

    // Flatten nested variables for compatibility
    const flattenedVariables = this.flattenVariables(variables);

    // Apply template with comprehensive security
    const application = applyTemplateSafe(promptTemplate, flattenedVariables, {
      strictMode: true,
      validateInjection: true,
      maxValueLength: 2000
    });

    if (!application.success) {
      logger.error({ errorCount: application.errors.length, warningCount: application.warnings.length, variableCount: Object.keys(variables).length }, 'Prompt injection blocked');

      throw new Error(
        `Template application blocked: ${application.errors.join(', ')}`
      );
    }

    if (application.warnings.length > 0) {
      logger.warn({ warningCount: application.warnings.length }, 'Template application produced warnings');
    }

    return application.result!;
  }

  /**
   * Flatten nested variables for template compatibility
   * Converts { user: { name: 'Alice' } } → { 'user.name': 'Alice' }
   */
  private static flattenVariables(obj: Record<string, any>, prefix: string = ''): Record<string, any> {
    const flattened: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively flatten nested objects
        Object.assign(flattened, this.flattenVariables(value, fullKey));
      } else {
        flattened[fullKey] = value;
      }
    }

    return flattened;
  }

  private static getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private static async updateTemplateUsage(templateId: string): Promise<void> {
    await prisma.agentTemplate.update({
      where: { id: templateId },
      data: {
        usageCount: { increment: 1 }
      }
    });
  }

  private static async calculatePerformanceMetrics(template: any, task: any, context: Record<string, any>): Promise<any> {
    // Calculate estimated execution time based on template complexity and task type
    const baseTime = template.averageTime || 60; // Default 60 seconds
    const complexityMultiplier = this.getComplexityMultiplier(template, task);
    const estimatedExecutionTime = Math.round(baseTime * complexityMultiplier);

    // Calculate complexity score based on template and context
    const complexityScore = this.calculateComplexityScore(template, context);

    // Calculate confidence level based on template success rate and compatibility
    const confidenceLevel = Math.round((template.successRate || 50) * 0.8 + 20);

    return {
      estimatedExecutionTime,
      complexityScore,
      confidenceLevel: Math.min(100, Math.max(0, confidenceLevel))
    };
  }

  private static getCompatibleCategories(taskType: string): AgentCategory[] {
    const categoryMap: Record<string, AgentCategory[]> = {
      'ACTION': [AgentCategory.GENERAL, AgentCategory.AUTOMATION],
      'DECISION': [AgentCategory.ANALYSIS, AgentCategory.GENERAL],
      'MILESTONE': [AgentCategory.MONITORING, AgentCategory.GENERAL],
      'APPROVAL': [AgentCategory.REVIEW, AgentCategory.GENERAL],
      'DOCUMENT': [AgentCategory.DOCUMENTATION, AgentCategory.GENERAL],
      'MCP_SERVICE': [AgentCategory.MCP_SERVICE, AgentCategory.GENERAL],
      'PIPELINE': [AgentCategory.AUTOMATION, AgentCategory.GENERAL],
      // Legacy mappings (pre-rationalization Apr 2026)
      'MCP_SERVICE_REGISTRATION': [AgentCategory.MCP_SERVICE, AgentCategory.GENERAL],
      'MCP_SERVICE_DISCOVERY': [AgentCategory.MCP_SERVICE, AgentCategory.GENERAL],
      'MCP_SERVICE_TEST': [AgentCategory.MCP_SERVICE, AgentCategory.GENERAL],
      'MCP_SERVICE_INTEGRATION': [AgentCategory.MCP_SERVICE, AgentCategory.GENERAL],
    };

    return categoryMap[taskType] || [AgentCategory.GENERAL];
  }

  private static validateInputSchema(schema: Record<string, any>, context: Record<string, any>): string[] {
    const missingFields: string[] = [];
    
    if (schema.required && Array.isArray(schema.required)) {
      for (const field of schema.required) {
        if (!(field in context)) {
          missingFields.push(field);
        }
      }
    }

    return missingFields;
  }

  private static calculateCompatibilityScore(template: any, task: any, errors: string[], warnings: string[]): number {
    let score = 100;
    
    // Deduct points for errors and warnings
    score -= errors.length * 20;
    score -= warnings.length * 5;

    // Bonus for category compatibility
    const compatibleCategories = this.getCompatibleCategories(task.type);
    if (compatibleCategories.includes(template.category)) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  private static calculatePerformanceScore(template: any, context: Record<string, any>): number {
    let score = 50; // Base score

    // Factor in template success rate
    if (template.successRate) {
      score += (template.successRate - 50) * 0.5;
    }

    // Factor in usage count (popularity)
    if (template.usageCount > 10) {
      score += Math.min(20, template.usageCount * 0.5);
    }

    // Factor in average execution time (faster is better)
    if (template.averageTime) {
      if (template.averageTime < 60) {
        score += 10;
      } else if (template.averageTime > 300) {
        score -= 10;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  private static getComplexityMultiplier(template: any, task: any): number {
    let multiplier = 1.0;

    // Factor in template complexity
    if (template.capabilities && Object.keys(template.capabilities).length > 5) {
      multiplier += 0.2;
    }

    // Factor in task priority
    if (task.priority === 'HIGH' || task.priority === 'URGENT') {
      multiplier += 0.1;
    }

    return multiplier;
  }

  private static calculateComplexityScore(template: any, context: Record<string, any>): number {
    let score = 0;

    // Factor in template capabilities
    if (template.capabilities) {
      score += Object.keys(template.capabilities).length * 5;
    }

    // Factor in context size
    score += Object.keys(context).length * 2;

    // Factor in prompt template length
    if (template.promptTemplate) {
      score += Math.min(20, template.promptTemplate.length / 100);
    }

    return Math.min(100, score);
  }
}

export default AgentTemplateService;
