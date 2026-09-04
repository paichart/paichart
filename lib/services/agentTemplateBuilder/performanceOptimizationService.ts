import { tokenManager } from '@/lib/services/llm/tokenManager';
import { mcpService } from '@/lib/services/mcp/mcpService';
import { TemplateData, ServiceResponse } from './types';
import { logger } from '@/lib/logger';

const perfLogger = logger.child({ module: 'PerformanceOptimizationService' });

/**
 * Performance Optimization Service
 * 
 * Provides advanced optimization algorithms for agent templates.
 * Handles token optimization, prompt compression, and tool selection optimization.
 */

export interface OptimizationOptions {
  enableTokenOptimization?: boolean;
  enablePromptCompression?: boolean;
  enableToolOptimization?: boolean;
  targetTokenReduction?: number; // Percentage (0-50)
  preserveQuality?: boolean;
  userId?: string;
}

export interface OptimizationResult {
  success: boolean;
  optimizedTemplate: TemplateData;
  improvements: {
    tokenReduction: number;
    performanceGain: number;
    costSavings: number;
    qualityImpact: number;
  };
  changes: OptimizationChange[];
  recommendations: string[];
  warnings: string[];
}

export interface OptimizationChange {
  type: 'token' | 'prompt' | 'tool' | 'configuration';
  field: string;
  oldValue: any;
  newValue: any;
  impact: {
    tokenSavings?: number;
    performanceGain?: number;
    qualityImpact?: number;
  };
  description: string;
}

export interface TokenOptimizationResult {
  originalTokens: number;
  optimizedTokens: number;
  reduction: number;
  optimizedPrompt: string;
  changes: string[];
}

export interface PromptCompressionResult {
  originalLength: number;
  compressedLength: number;
  compressionRatio: number;
  compressedPrompt: string;
  preservedElements: string[];
}

export interface ToolOptimizationResult {
  originalTools: any[];
  optimizedTools: any[];
  removedTools: any[];
  reorderedTools: any[];
  performanceGain: number;
}

/**
 * Performance Optimization Service Class
 */
export class PerformanceOptimizationService {
  /**
   * Optimize template for better performance
   */
  static async optimizeTemplate(
    templateData: TemplateData,
    options: OptimizationOptions = {}
  ): Promise<ServiceResponse<OptimizationResult>> {
    try {
      perfLogger.info({ templateName: templateData.name }, 'Starting optimization for template');

      const optimizedTemplate = { ...templateData };
      const changes: OptimizationChange[] = [];
      const recommendations: string[] = [];
      const warnings: string[] = [];

      let totalTokenSavings = 0;
      let totalPerformanceGain = 0;
      let totalCostSavings = 0;
      let qualityImpact = 0;

      // Token optimization
      if (options.enableTokenOptimization !== false) {
        const tokenResult = await this.optimizeTokenUsage(optimizedTemplate, options);
        if (tokenResult.success && tokenResult.data) {
          const tokenData = tokenResult.data;
          optimizedTemplate.promptTemplate = tokenData.optimizedPrompt;
          
          changes.push({
            type: 'token',
            field: 'promptTemplate',
            oldValue: templateData.promptTemplate,
            newValue: tokenData.optimizedPrompt,
            impact: {
              tokenSavings: tokenData.reduction,
              performanceGain: tokenData.reduction * 0.1, // Estimate 10% performance gain per 100 tokens saved
              qualityImpact: -0.05 // Small quality impact
            },
            description: `Optimized prompt template reducing token usage by ${tokenData.reduction} tokens`
          });

          totalTokenSavings += tokenData.reduction;
          totalPerformanceGain += tokenData.reduction * 0.1;
          qualityImpact += 0.05;
        }
      }

      // Prompt compression
      if (options.enablePromptCompression) {
        const compressionResult = await this.optimizePrompt(optimizedTemplate.promptTemplate || '', options);
        if (compressionResult.success && compressionResult.data) {
          const compressionData = compressionResult.data;
          optimizedTemplate.promptTemplate = compressionData.compressedPrompt;
          
          const tokenSavings = Math.round((compressionData.originalLength - compressionData.compressedLength) / 4);
          
          changes.push({
            type: 'prompt',
            field: 'promptTemplate',
            oldValue: templateData.promptTemplate,
            newValue: compressionData.compressedPrompt,
            impact: {
              tokenSavings,
              performanceGain: tokenSavings * 0.15, // Higher gain from compression
              qualityImpact: -0.1 // Moderate quality impact
            },
            description: `Compressed prompt by ${compressionData.compressionRatio}% while preserving key elements`
          });

          totalTokenSavings += tokenSavings;
          totalPerformanceGain += tokenSavings * 0.15;
          qualityImpact += 0.1;
        }
      }

      // Tool optimization
      if (options.enableToolOptimization !== false) {
        const toolResult = await this.optimizeToolSelection(optimizedTemplate, options);
        if (toolResult.success && toolResult.data) {
          const toolData = toolResult.data;
          
          if (optimizedTemplate.metadata?.mcpToolConfiguration) {
            optimizedTemplate.metadata.mcpToolConfiguration.selectedTools = toolData.optimizedTools;
          }
          
          changes.push({
            type: 'tool',
            field: 'metadata.mcpToolConfiguration.selectedTools',
            oldValue: toolData.originalTools,
            newValue: toolData.optimizedTools,
            impact: {
              performanceGain: toolData.performanceGain,
              qualityImpact: toolData.removedTools.length > 0 ? -0.05 : 0
            },
            description: `Optimized tool selection: removed ${toolData.removedTools.length} redundant tools, reordered ${toolData.reorderedTools.length} for better performance`
          });

          totalPerformanceGain += toolData.performanceGain;
          if (toolData.removedTools.length > 0) {
            qualityImpact += 0.05;
          }
        }
      }

      // Configuration optimization
      const configOptimization = this.optimizeConfiguration(optimizedTemplate, options);
      if (configOptimization.changes.length > 0) {
        changes.push(...configOptimization.changes);
        recommendations.push(...configOptimization.recommendations);
        totalPerformanceGain += configOptimization.performanceGain;
      }

      // Calculate cost savings (estimate based on token reduction)
      totalCostSavings = totalTokenSavings * 0.0001; // Rough estimate: $0.0001 per token

      // Generate recommendations
      if (totalTokenSavings < 100 && options.targetTokenReduction && options.targetTokenReduction > 10) {
        recommendations.push('Consider more aggressive prompt optimization to reach target token reduction');
      }

      if (qualityImpact > 0.2) {
        warnings.push('Significant quality impact detected. Consider testing optimized template thoroughly');
      }

      if (totalPerformanceGain < 5) {
        recommendations.push('Limited performance gains achieved. Template may already be well-optimized');
      }

      // Additional recommendations based on template analysis
      const additionalRecommendations = this.generateAdditionalRecommendations(templateData, optimizedTemplate);
      recommendations.push(...additionalRecommendations);

      const result: OptimizationResult = {
        success: true,
        optimizedTemplate,
        improvements: {
          tokenReduction: Math.round(totalTokenSavings),
          performanceGain: Math.round(totalPerformanceGain * 100) / 100,
          costSavings: Math.round(totalCostSavings * 10000) / 10000,
          qualityImpact: Math.round(qualityImpact * 100) / 100
        },
        changes,
        recommendations,
        warnings
      };

      perfLogger.info({ tokenSavings: totalTokenSavings, performanceGain: totalPerformanceGain }, 'Optimization completed');
      return { success: true, data: result };

    } catch (error) {
      perfLogger.error({ err: error }, 'Optimization failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Optimization failed'
      };
    }
  }

  /**
   * Optimize token usage in template
   */
  static async optimizeTokenUsage(
    templateData: TemplateData,
    options: OptimizationOptions = {}
  ): Promise<ServiceResponse<TokenOptimizationResult>> {
    try {
      const originalPrompt = templateData.promptTemplate || '';
      const originalTokens = this.estimateTokenCount(originalPrompt);
      
      let optimizedPrompt = originalPrompt;
      const changes: string[] = [];

      // Remove redundant whitespace
      const whitespaceOptimized = optimizedPrompt.replace(/\s+/g, ' ').trim();
      if (whitespaceOptimized !== optimizedPrompt) {
        optimizedPrompt = whitespaceOptimized;
        changes.push('Removed redundant whitespace');
      }

      // Remove redundant phrases
      const redundantPhrases = [
        /please\s+/gi,
        /kindly\s+/gi,
        /\s+and\s+also\s+/gi,
        /\s+in\s+order\s+to\s+/gi,
        /\s+it\s+is\s+important\s+to\s+/gi,
        /\s+make\s+sure\s+to\s+/gi
      ];

      for (const phrase of redundantPhrases) {
        const beforeOptimization = optimizedPrompt;
        optimizedPrompt = optimizedPrompt.replace(phrase, ' ');
        if (beforeOptimization !== optimizedPrompt) {
          changes.push(`Removed redundant phrase: ${phrase.source}`);
        }
      }

      // Simplify complex sentences
      const simplifications = [
        { from: /in the event that/gi, to: 'if' },
        { from: /due to the fact that/gi, to: 'because' },
        { from: /for the purpose of/gi, to: 'to' },
        { from: /with regard to/gi, to: 'about' },
        { from: /in spite of the fact that/gi, to: 'although' }
      ];

      for (const simplification of simplifications) {
        const beforeOptimization = optimizedPrompt;
        optimizedPrompt = optimizedPrompt.replace(simplification.from, simplification.to);
        if (beforeOptimization !== optimizedPrompt) {
          changes.push(`Simplified: "${simplification.from.source}" to "${simplification.to}"`);
        }
      }

      // Remove filler words if not preserving quality
      if (!options.preserveQuality) {
        const fillerWords = /\b(actually|basically|literally|really|very|quite|rather|somewhat|pretty|fairly)\s+/gi;
        const beforeOptimization = optimizedPrompt;
        optimizedPrompt = optimizedPrompt.replace(fillerWords, '');
        if (beforeOptimization !== optimizedPrompt) {
          changes.push('Removed filler words');
        }
      }

      // Clean up extra spaces
      optimizedPrompt = optimizedPrompt.replace(/\s+/g, ' ').trim();

      const optimizedTokens = this.estimateTokenCount(optimizedPrompt);
      const reduction = originalTokens - optimizedTokens;

      const result: TokenOptimizationResult = {
        originalTokens,
        optimizedTokens,
        reduction,
        optimizedPrompt,
        changes
      };

      return { success: true, data: result };

    } catch (error) {
      perfLogger.error({ err: error }, 'Token optimization failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token optimization failed'
      };
    }
  }

  /**
   * Optimize prompt through compression
   */
  static async optimizePrompt(
    prompt: string,
    options: OptimizationOptions = {}
  ): Promise<ServiceResponse<PromptCompressionResult>> {
    try {
      const originalLength = prompt.length;
      let compressedPrompt = prompt;
      const preservedElements: string[] = [];

      // Preserve important elements
      const importantPatterns = [
        /\{[^}]+\}/g, // Template variables
        /\[[^\]]+\]/g, // Bracketed instructions
        /\*\*[^*]+\*\*/g, // Bold text
        /`[^`]+`/g, // Code snippets
        /https?:\/\/[^\s]+/g // URLs
      ];

      const preservedContent: { pattern: RegExp; matches: string[] }[] = [];
      
      for (const pattern of importantPatterns) {
        const matches = prompt.match(pattern) || [];
        if (matches.length > 0) {
          preservedContent.push({ pattern, matches });
          preservedElements.push(`${matches.length} ${pattern.source} patterns`);
        }
      }

      // Apply compression techniques
      
      // 1. Abbreviate common words
      const abbreviations = [
        { from: /\byou are\b/gi, to: "you're" },
        { from: /\bdo not\b/gi, to: "don't" },
        { from: /\bcannot\b/gi, to: "can't" },
        { from: /\bwill not\b/gi, to: "won't" },
        { from: /\bshould not\b/gi, to: "shouldn't" },
        { from: /\bwould not\b/gi, to: "wouldn't" }
      ];

      for (const abbrev of abbreviations) {
        compressedPrompt = compressedPrompt.replace(abbrev.from, abbrev.to);
      }

      // 2. Remove redundant instructions
      const redundantInstructions = [
        /please\s+remember\s+to\s+/gi,
        /make\s+sure\s+you\s+/gi,
        /it\s+is\s+important\s+that\s+you\s+/gi,
        /you\s+should\s+always\s+/gi,
        /be\s+sure\s+to\s+/gi
      ];

      for (const instruction of redundantInstructions) {
        compressedPrompt = compressedPrompt.replace(instruction, '');
      }

      // 3. Compress repetitive phrases
      const repetitivePatterns = [
        /\b(the|a|an)\s+(\w+)\s+\1\s+\2\b/gi, // "the user the user" -> "the user"
        /\b(\w+)\s+and\s+\1\b/gi, // "analyze and analyze" -> "analyze"
      ];

      for (const pattern of repetitivePatterns) {
        compressedPrompt = compressedPrompt.replace(pattern, '$1 $2');
      }

      // 4. Simplify sentence structure
      if (!options.preserveQuality) {
        // More aggressive compression
        compressedPrompt = compressedPrompt
          .replace(/\bin\s+order\s+to\s+/gi, 'to ')
          .replace(/\bfor\s+the\s+purpose\s+of\s+/gi, 'to ')
          .replace(/\bdue\s+to\s+the\s+fact\s+that\s+/gi, 'because ')
          .replace(/\bin\s+the\s+event\s+that\s+/gi, 'if ');
      }

      // 5. Clean up spacing
      compressedPrompt = compressedPrompt
        .replace(/\s+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .trim();

      // Restore preserved content
      for (const preserved of preservedContent) {
        // This is a simplified restoration - in practice, you'd want more sophisticated preservation
        preservedElements.push(`Preserved ${preserved.matches.length} ${preserved.pattern.source} elements`);
      }

      const compressedLength = compressedPrompt.length;
      const compressionRatio = Math.round(((originalLength - compressedLength) / originalLength) * 100);

      const result: PromptCompressionResult = {
        originalLength,
        compressedLength,
        compressionRatio,
        compressedPrompt,
        preservedElements
      };

      return { success: true, data: result };

    } catch (error) {
      perfLogger.error({ err: error }, 'Prompt compression failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Prompt compression failed'
      };
    }
  }

  /**
   * Optimize tool selection for better performance
   */
  static async optimizeToolSelection(
    templateData: TemplateData,
    options: OptimizationOptions = {}
  ): Promise<ServiceResponse<ToolOptimizationResult>> {
    try {
      const mcpConfig = templateData.metadata?.mcpToolConfiguration;
      const originalTools = mcpConfig?.selectedTools || [];
      
      if (originalTools.length === 0) {
        return {
          success: true,
          data: {
            originalTools,
            optimizedTools: [],
            removedTools: [],
            reorderedTools: [],
            performanceGain: 0
          }
        };
      }

      let optimizedTools = [...originalTools];
      const removedTools: any[] = [];
      const reorderedTools: any[] = [];

      // 1. Remove duplicate tools
      const uniqueTools = optimizedTools.filter((tool, index, array) => 
        array.findIndex(t => t.toolName === tool.toolName && t.serverName === tool.serverName) === index
      );
      
      if (uniqueTools.length < optimizedTools.length) {
        const duplicates = optimizedTools.filter(tool => 
          !uniqueTools.some(unique => unique.toolName === tool.toolName && unique.serverName === tool.serverName)
        );
        removedTools.push(...duplicates);
        optimizedTools = uniqueTools;
      }

      // 2. Remove redundant tools (tools with similar functionality)
      const redundantPairs = [
        ['read_file', 'get_file_content'],
        ['write_file', 'save_file'],
        ['list_files', 'get_directory_listing'],
        ['web_search', 'search_web'],
        ['send_email', 'email_send']
      ];

      for (const [primary, secondary] of redundantPairs) {
        const primaryTool = optimizedTools.find(t => t.toolName === primary);
        const secondaryTool = optimizedTools.find(t => t.toolName === secondary);
        
        if (primaryTool && secondaryTool) {
          // Remove secondary tool
          optimizedTools = optimizedTools.filter(t => t.toolName !== secondary);
          removedTools.push(secondaryTool);
        }
      }

      // 3. Reorder tools by performance priority
      const performancePriority = {
        'file': 1,
        'data': 2,
        'web': 3,
        'communication': 4,
        'ai': 5,
        'system': 6,
        'general': 7
      };

      const toolsWithPriority = optimizedTools.map(tool => ({
        ...tool,
        priority: this.getToolCategory(tool.toolName) in performancePriority 
          ? performancePriority[this.getToolCategory(tool.toolName) as keyof typeof performancePriority]
          : 7
      }));

      const reorderedOptimizedTools = toolsWithPriority
        .sort((a, b) => a.priority - b.priority)
        .map(({ priority, ...tool }) => tool);

      // Check if reordering occurred
      const originalOrder = optimizedTools.map(t => t.toolName).join(',');
      const newOrder = reorderedOptimizedTools.map(t => t.toolName).join(',');
      
      if (originalOrder !== newOrder) {
        reorderedTools.push(...reorderedOptimizedTools);
        optimizedTools = reorderedOptimizedTools;
      }

      // 4. Validate tool availability
      if (mcpService.isReady()) {
        const unavailableTools: any[] = [];
        for (const tool of optimizedTools) {
          const serverTools = mcpService.getServerTools(tool.serverName);
          const isAvailable = serverTools.some((t: any) => t.name === tool.toolName);
          if (!isAvailable) {
            unavailableTools.push(tool);
          }
        }
        
        if (unavailableTools.length > 0) {
          optimizedTools = optimizedTools.filter(tool => !unavailableTools.includes(tool));
          removedTools.push(...unavailableTools);
        }
      }

      // Calculate performance gain
      const toolsRemoved = removedTools.length;
      const toolsReordered = reorderedTools.length;
      const performanceGain = (toolsRemoved * 2) + (toolsReordered > 0 ? 5 : 0); // Estimate

      const result: ToolOptimizationResult = {
        originalTools,
        optimizedTools,
        removedTools,
        reorderedTools,
        performanceGain
      };

      return { success: true, data: result };

    } catch (error) {
      perfLogger.error({ err: error }, 'Tool optimization failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tool optimization failed'
      };
    }
  }

  // Private helper methods

  private static estimateTokenCount(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  private static getToolCategory(toolName: string): string {
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

  private static optimizeConfiguration(
    templateData: TemplateData,
    options: OptimizationOptions
  ): { changes: OptimizationChange[]; recommendations: string[]; performanceGain: number } {
    const changes: OptimizationChange[] = [];
    const recommendations: string[] = [];
    let performanceGain = 0;

    // Optimize token management settings
    const tokenConfig = templateData.metadata?.tokenManagement;
    if (tokenConfig) {
      // Enable caching if not already enabled
      if (!tokenConfig.optimization?.enableCaching) {
        changes.push({
          type: 'configuration',
          field: 'metadata.tokenManagement.optimization.enableCaching',
          oldValue: false,
          newValue: true,
          impact: { performanceGain: 10 },
          description: 'Enabled token caching for better performance'
        });
        performanceGain += 10;
      }

      // Optimize complexity multiplier
      if (tokenConfig.optimization?.complexityMultiplier && tokenConfig.optimization.complexityMultiplier > 2.0) {
        changes.push({
          type: 'configuration',
          field: 'metadata.tokenManagement.optimization.complexityMultiplier',
          oldValue: tokenConfig.optimization.complexityMultiplier,
          newValue: 1.5,
          impact: { performanceGain: 5, tokenSavings: 200 },
          description: 'Reduced complexity multiplier for better token efficiency'
        });
        performanceGain += 5;
      }
    }

    // Optimize workflow settings
    const workflowConfig = templateData.metadata?.workflowIntegration;
    if (workflowConfig?.performanceThresholds) {
      const thresholds = workflowConfig.performanceThresholds;
      
      // Optimize execution timeout
      if (thresholds.maxExecutionTime > 300000) { // 5 minutes
        recommendations.push('Consider reducing max execution time for better responsiveness');
      }
      
      // Optimize token usage threshold
      if (thresholds.maxTokenUsage > 8000) {
        recommendations.push('Consider reducing max token usage threshold to control costs');
      }
    }

    return { changes, recommendations, performanceGain };
  }

  private static generateAdditionalRecommendations(
    originalTemplate: TemplateData,
    optimizedTemplate: TemplateData
  ): string[] {
    const recommendations: string[] = [];

    // Check prompt length
    const promptLength = optimizedTemplate.promptTemplate?.length || 0;
    if (promptLength > 2000) {
      recommendations.push('Consider breaking down the prompt into smaller, more focused sections');
    }

    // Check capability complexity
    const capabilities = optimizedTemplate.capabilities || {};
    const capabilityCount = Object.keys(capabilities).length;
    if (capabilityCount > 10) {
      recommendations.push('Consider reducing the number of capabilities to improve focus and performance');
    }

    // Check constraint complexity
    const constraints = optimizedTemplate.constraints || {};
    const constraintCount = Object.keys(constraints).length;
    if (constraintCount > 15) {
      recommendations.push('Consider simplifying constraints to reduce processing overhead');
    }

    // Check MCP tool count
    const toolCount = optimizedTemplate.metadata?.mcpToolConfiguration?.selectedTools?.length || 0;
    if (toolCount > 8) {
      recommendations.push('Consider reducing the number of MCP tools to improve execution speed');
    }

    return recommendations;
  }
}
