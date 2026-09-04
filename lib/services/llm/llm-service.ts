import { AnthropicSdkProvider } from './anthropic-sdk-provider';
import { LLMProvider, LLMRequestOptions, LLMResponse, LLMServiceProvider, LLMStreamChunk, TemplateAnalysisRequest, TemplateAnalysisResponse, MCPTokenDefaults, DEFAULT_MAX_TOKENS } from './types';
import { tokenManager } from './tokenManager';
import { mcpService } from '../mcp/mcpService';
import { prisma } from '@/lib/prisma';
import { logger as rootLogger } from '@/lib/logger';

const logger = rootLogger.child({ domain: 'llm' });

/**
 * LLM Service for template analysis and AI-assisted features
 */
export class LLMService {
  /**
   * The current provider
   */
  private provider: LLMServiceProvider;
  
  /**
   * Available providers
   */
  private providers: Map<LLMProvider, LLMServiceProvider>;
  
  /**
   * Default provider
   */
  private defaultProvider: LLMProvider;
  
  /**
   * Constructor
   */
  constructor() {
    // Initialize providers
    this.providers = new Map();
    this.providers.set(LLMProvider.ANTHROPIC_SDK, new AnthropicSdkProvider());
    
    // Set default provider based on environment variable
    this.defaultProvider = process.env.DEFAULT_LLM_PROVIDER as LLMProvider || LLMProvider.ANTHROPIC_SDK;
    this.provider = this.providers.get(this.defaultProvider) || this.providers.get(LLMProvider.ANTHROPIC_SDK)!;
    
    logger.info({ provider: this.defaultProvider }, 'default provider initialized');
  }

  /**
   * Resolve per-request LLM options from user settings.
   * Returns { provider, apiKey } to pass into generateText/streamText options.
   * Does NOT mutate the singleton provider — all config flows per-request.
   */
  // Two-axis (2026-06-18): this resolves the PROVIDER/KEY axis only. MODEL is NOT a
  // user/system setting — it lives on the agent template/task (resolved at
  // normalizeModelConfig, fail-loud if absent). `model` was dropped from the return.
  async resolveUserSettings(userId: string): Promise<{ provider?: LLMProvider; apiKey?: string }> {
    try {
      // First check if the user has their own settings
      const userSettings = await prisma.userSettings.findUnique({
        where: { userId },
      });

      if (userSettings && userSettings.settings) {
        const llmSettings = (userSettings.settings as any).llm;

        // If the user has LLM settings and is not using the system provider
        if (llmSettings && !llmSettings.useSystemProvider) {
          return this.extractSettingsConfig(llmSettings);
        }
      }

      // If the user doesn't have settings or is using the system provider,
      // use the global settings from CustomSchema
      const globalSettings = await prisma.customSchema.findFirst({
        where: { name: 'llm_settings' },
      });

      logger.debug({ hasGlobalSettings: !!globalSettings }, 'loaded global LLM settings');

      if (globalSettings) {
        const llmSettings = globalSettings.schema as any;

        logger.debug({ hasLlmSettings: !!llmSettings }, 'parsed LLM settings from global config');

        if (llmSettings) {
          return this.extractSettingsConfig(llmSettings);
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'failed to resolve user LLM settings');
    }
    return {};
  }

  /**
   * Extract provider enum and API key from raw settings (no mutation).
   * MODEL is intentionally NOT extracted — model is a template/task concern, not a
   * user/system setting (two-axis, 2026-06-18). Any stale stored `settings.model` is ignored.
   */
  private extractSettingsConfig(settings: any): { provider?: LLMProvider; apiKey?: string } {
    if (!settings.provider) {
      return {};
    }

    let provider: LLMProvider;
    let apiKey: string | undefined;

    switch (settings.provider) {
      case 'anthropic':
      case 'anthropic_sdk':
        provider = LLMProvider.ANTHROPIC_SDK;
        apiKey = settings.anthropicApiKey || undefined;
        break;
      default:
        provider = LLMProvider.ANTHROPIC_SDK;
    }

    return { provider, apiKey };
  }
  
  /**
   * Set the provider to use
   */
  async setProvider(provider: LLMProvider): Promise<boolean> {
    const newProvider = this.providers.get(provider);
    
    if (!newProvider) {
      throw new Error(`Provider ${provider} not found`);
    }
    
    // Provider configuration is per-request (via LLMRequestOptions.apiKey)
    // rather than from environment. As of task #85 (2026-04-16) the Anthropic
    // provider no longer reads ANTHROPIC_API_KEY from env — every request
    // must supply an apiKey resolved from per-user UserSettings.
    try {
      switch (provider) {
        case LLMProvider.ANTHROPIC_SDK:
          // Per-request apiKey required — no env fallback. See
          // lib/services/llm/anthropic-sdk-provider.ts getClientForRequest.
          break;
      }
    } catch (error) {
      logger.error({ err: error, provider }, 'failed to configure provider from environment');
    }
    
    // Check if the provider is available
    const isAvailable = await newProvider.isAvailable();
    
    if (!isAvailable) {
      throw new Error(`Provider ${provider} is not available. Check your API key or connection.`);
    }
    
    this.provider = newProvider;
    return true;
  }
  
  /**
   * Get the current provider
   */
  getProvider(): LLMServiceProvider {
    return this.provider;
  }
  
  /**
   * Check if a provider is available
   */
  async isProviderAvailable(provider: LLMProvider): Promise<boolean> {
    const providerInstance = this.providers.get(provider);
    
    if (!providerInstance) {
      return false;
    }
    
    return await providerInstance.isAvailable();
  }
  
  /**
   * Generate text from a prompt with enhanced token management
   */
  async generateText(prompt: string, options?: LLMRequestOptions, userId?: string): Promise<LLMResponse> {
    // Enhanced token management
    const enhancedOptions = this.enhanceOptionsWithTokenManagement(prompt, options);
    
    // Check budget if token management is configured
    if (enhancedOptions.tokenManagement?.budget && userId) {
      const budgetCheck = tokenManager.checkBudget(
        enhancedOptions.maxTokens || MCPTokenDefaults.GENERAL_MAX_TOKENS,
        userId,
        enhancedOptions.tokenManagement.budget
      );
      
      if (!budgetCheck.allowed) {
        throw new Error(`Token budget exceeded: ${budgetCheck.reason}`);
      }
    }
    
    // Get the provider to use
    const providerToUse = this.getProviderToUse(options?.provider);
    
    // Model is passed per-request via enhancedOptions.model (not mutating singleton)

    // Execute the request
    const response = await providerToUse.generateText(prompt, enhancedOptions);
    
    // Record usage for tracking
    if (response.usage) {
      tokenManager.recordUsage({
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        cacheReadTokens: response.usage.cacheReadTokens,
        cacheCreationTokens: response.usage.cacheCreationTokens,
        requestType: this.determineRequestType(options)
      }, userId);
    }
    
    return response;
  }
  
  /**
   * Stream text from a prompt
   * @param prompt Prompt to generate text from
   * @param options Options for the request
   * @returns AsyncGenerator that yields stream chunks
   */
  async *streamText(
    prompt: string,
    options?: LLMRequestOptions
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    logger.debug({
      provider: options?.provider,
      model: options?.model,
      functionCount: options?.functions?.length ?? 0,
      webSearch: !!options?.webSearch,
      promptLength: prompt.length
    }, 'streaming text request');
    
    // Get the provider to use
    const providerToUse = this.getProviderToUse(options?.provider);
    
    // Model is passed per-request via options.model (not mutating singleton)

    logger.debug({ provider: providerToUse.provider }, 'selected provider for streaming');
    
    // Check if the provider supports streaming
    if (!providerToUse.streamText) {
      logger.warn({ provider: providerToUse.provider }, 'provider does not support streaming, using fallback');
      
      // Fallback to non-streaming and simulate streaming
      try {
        const response = await providerToUse.generateText(prompt, options);
        
        // Split the response text into chunks to simulate streaming
        const chunks = response.text.split(' ');
        
        for (let i = 0; i < chunks.length; i++) {
          yield {
            text: chunks[i] + ' ',
            provider: providerToUse.provider,
            isComplete: i === chunks.length - 1
          };
          
          // Add a small delay to simulate streaming
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        // If there's a function call in the response, yield it at the end
        if (response.functionCall) {
          logger.debug({ functionCall: response.functionCall.name }, 'function call in fallback response');
          yield {
            text: '',
            provider: providerToUse.provider,
            isComplete: true,
            functionCall: response.functionCall
          };
        }
        
        // If there are web search results in the response, yield them at the end
        if (response.webSearchResults && response.webSearchResults.length > 0) {
          logger.debug({ count: response.webSearchResults.length }, 'web search results in fallback response');
          yield {
            text: '',
            provider: providerToUse.provider,
            isComplete: true,
            webSearchResults: response.webSearchResults
          };
        }
        
        // If there are citations in the response, yield them at the end
        if (response.citations && response.citations.length > 0) {
          logger.debug({ count: response.citations.length }, 'citations in fallback response');
          yield {
            text: '',
            provider: providerToUse.provider,
            isComplete: true,
            citations: response.citations
          };
        }
        
        // If there are search queries in the response, yield them at the end
        if (response.searchQueries && response.searchQueries.length > 0) {
          logger.debug({ count: response.searchQueries.length }, 'search queries in fallback response');
          yield {
            text: '',
            provider: providerToUse.provider,
            isComplete: true,
            searchQueries: response.searchQueries
          };
        }
        
        // If there's usage information in the response, yield it at the end
        if (response.usage) {
          logger.debug({ inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens }, 'usage in fallback response');
          yield {
            text: '',
            provider: providerToUse.provider,
            isComplete: true,
            usage: response.usage
          };
        }
      } catch (error) {
        logger.error({ err: error }, 'error generating text in streaming fallback');
        
        yield {
          text: '',
          provider: providerToUse.provider,
          isComplete: true,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error
          }
        };
      }
      
      return;
    }
    
    try {
      // Stream text from the provider
      for await (const chunk of providerToUse.streamText(prompt, options)) {
        // Log notable stream events at debug level
        if (chunk.functionCall) {
          logger.debug({ functionCall: chunk.functionCall.name }, 'function call in stream chunk');
        }
        if (chunk.isComplete && chunk.usage) {
          logger.debug({ inputTokens: chunk.usage.inputTokens, outputTokens: chunk.usage.outputTokens }, 'stream complete with usage');
        }

        yield chunk;
      }
    } catch (error) {
      logger.error({ err: error }, 'error streaming text');
      
      yield {
        text: '',
        provider: providerToUse.provider,
        isComplete: true,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error
        }
      };
    }
  }
  
  /**
   * Stream text with function calling
   * @param prompt Prompt to generate text from
   * @param functions Functions to make available to the model
   * @param options Additional options for the request
   * @returns AsyncGenerator that yields stream chunks
   */
  async *streamTextWithFunctions(
    prompt: string,
    functions: LLMRequestOptions['functions'],
    options?: Omit<LLMRequestOptions, 'functions'>
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    logger.debug({ functionCount: functions?.length ?? 0 }, 'streaming text with functions');
    
    // Merge options with functions
    const mergedOptions: LLMRequestOptions = {
      ...options,
      functions,
      functionCall: options?.functionCall || 'auto'
    };
    
    // Stream text with functions
    for await (const chunk of this.streamText(prompt, mergedOptions)) {
      yield chunk;
    }
  }
  
  /**
   * Stream text with web search
   * @param prompt Prompt to generate text from
   * @param webSearchConfig Web search configuration
   * @param options Additional options for the request
   * @returns AsyncGenerator that yields stream chunks
   */
  async *streamTextWithWebSearch(
    prompt: string,
    webSearchConfig: LLMRequestOptions['webSearch'],
    options?: Omit<LLMRequestOptions, 'webSearch'>
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    logger.debug({ hasWebSearchConfig: !!webSearchConfig }, 'streaming text with web search');
    
    // Merge options with web search configuration
    const mergedOptions: LLMRequestOptions = {
      ...options,
      webSearch: webSearchConfig || {
        maxUses: 3
      }
    };
    
    // Stream text with web search
    for await (const chunk of this.streamText(prompt, mergedOptions)) {
      yield chunk;
    }
  }
  
  /**
   * Stream text with function calling and web search
   * @param prompt Prompt to generate text from
   * @param functions Functions to make available to the model
   * @param webSearchConfig Web search configuration
   * @param options Additional options for the request
   * @returns AsyncGenerator that yields stream chunks
   */
  async *streamTextWithFunctionsAndWebSearch(
    prompt: string,
    functions: LLMRequestOptions['functions'],
    webSearchConfig: LLMRequestOptions['webSearch'],
    options?: Omit<LLMRequestOptions, 'functions' | 'webSearch'>
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    logger.debug({ functionCount: functions?.length ?? 0, hasWebSearch: !!webSearchConfig }, 'streaming text with functions and web search');
    
    // Merge options with functions and web search
    const mergedOptions: LLMRequestOptions = {
      ...options,
      functions,
      functionCall: options?.functionCall || 'auto',
      webSearch: webSearchConfig || {
        maxUses: 3
      }
    };
    
    // Stream text with functions and web search
    for await (const chunk of this.streamText(prompt, mergedOptions)) {
      yield chunk;
    }
  }
  
  /**
   * Enhance options with token management
   */
  private enhanceOptionsWithTokenManagement(prompt: string, options?: LLMRequestOptions): LLMRequestOptions {
    const enhancedOptions = { ...options };
    
    // Calculate optimal token allocation if not specified
    if (!enhancedOptions.maxTokens) {
      const requestType = this.determineRequestType(options);
      const promptLength = prompt.length;
      const contextSize = options?.messages?.reduce((total, msg) => total + msg.content.length, 0) || 0;
      
      enhancedOptions.maxTokens = tokenManager.calculateTokenAllocation({
        requestType,
        promptLength,
        contextSize,
        complexity: 'medium', // Default complexity
        tokenManagement: options?.tokenManagement
      });
    }
    
    // Apply prompt optimization if enabled
    if (options?.tokenManagement?.optimization?.enabled) {
      const optimizationOptions = options.tokenManagement.optimization;
      
      if (optimizationOptions.compressPrompts) {
        // This would be handled by the tokenManager.optimizePrompt method
        // For now, we'll just log that optimization is enabled
        logger.debug('prompt optimization enabled');
      }
    }
    
    return enhancedOptions;
  }
  
  /**
   * Determine request type based on options
   */
  private determineRequestType(options?: LLMRequestOptions): 'mcp_workflow' | 'template_analysis' | 'agent_execution' | 'general' {
    // Check for MCP-related indicators
    if (options?.systemPrompt?.includes('MCP') || options?.systemPrompt?.includes('Model Context Protocol')) {
      return 'mcp_workflow';
    }
    
    // Check for template analysis indicators
    if (options?.systemPrompt?.includes('template') || options?.systemPrompt?.includes('analyze')) {
      return 'template_analysis';
    }
    
    // Check for agent execution indicators
    if (options?.functions && options.functions.length > 0) {
      return 'agent_execution';
    }
    
    // Check for web search (often used in agent workflows)
    if (options?.webSearch) {
      return 'agent_execution';
    }
    
    return 'general';
  }

  /**
   * Get the provider to use based on the specified provider name
   * @param provider Provider name
   * @returns Provider instance
   */
  private getProviderToUse(provider?: LLMProvider): LLMServiceProvider {
    if (!provider) {
      logger.debug({ defaultProvider: this.provider.provider }, 'no provider specified, using default');
      return this.provider;
    }

    const providerInstance = this.providers.get(provider);

    if (!providerInstance) {
      logger.warn({ requested: provider, fallback: this.provider.provider }, 'requested provider not found, using default');
      return this.provider;
    }

    logger.debug({ provider }, 'using requested provider');
    return providerInstance;
  }
  
  /**
   * Analyze a template
   */
  async analyzeTemplate(request: TemplateAnalysisRequest): Promise<TemplateAnalysisResponse> {
    const { template, analysisType, context } = request;
    
    // Create a prompt based on the analysis type
    let prompt = '';
    let systemPrompt = '';
    
    switch (analysisType) {
      case 'folding':
        systemPrompt = 'You are an AI assistant that helps identify which sections of a template should be folded (hidden) to improve readability and focus. Analyze the template structure and suggest sections to fold based on relevance to the current context.';
        prompt = `Analyze this template and identify which sections should be folded (hidden) to improve readability and focus:
${JSON.stringify(template, null, 2)}

${context ? `Additional context: ${JSON.stringify(context, null, 2)}` : ''}

Respond with a JSON object that contains:
1. "foldedSections": An array of objects with "stageId", "taskIds" (array of task IDs to fold), and "reason" (why these should be folded)
2. Keep your explanations concise and focused on why certain sections are less relevant to the current context.

Format your response as valid JSON without any additional text.`;
        break;
        
      case 'relationships':
        systemPrompt = 'You are an AI assistant that helps identify relationships between different parts of a template. Analyze the template structure and suggest connections between stages and tasks.';
        prompt = `Analyze this template and identify relationships between different stages and tasks:
${JSON.stringify(template, null, 2)}

${context ? `Additional context: ${JSON.stringify(context, null, 2)}` : ''}

Respond with a JSON object that contains:
1. "relatedSections": An array of objects with "sourceStageId", "sourceTaskId", "relatedStageId", "relatedTaskId", "relationshipType" (e.g., "dependency", "similar", "complementary"), and "confidence" (a number between 0 and 1)
2. Focus on non-obvious relationships that might not be explicitly defined in the template.

Format your response as valid JSON without any additional text.`;
        break;
        
      case 'suggestions':
        systemPrompt = 'You are an AI assistant that provides suggestions for improving a template. Analyze the template structure and suggest improvements.';
        prompt = `Analyze this template and provide suggestions for improvements:
${JSON.stringify(template, null, 2)}

${context ? `Additional context: ${JSON.stringify(context, null, 2)}` : ''}

Respond with a JSON object that contains:
1. "suggestions": An array of objects with "stageId" (optional), "taskId" (optional), "suggestion" (the actual suggestion), "type" (one of: "add", "modify", "remove", "general"), and "priority" (one of: "high", "medium", "low")
2. Focus on actionable suggestions that would improve the template's clarity, completeness, or effectiveness.

Format your response as valid JSON without any additional text.`;
        break;
        
      case 'search':
        systemPrompt = 'You are an AI assistant that helps search for relevant sections in a template based on a query. Analyze the template structure and identify the most relevant sections.';
        prompt = `Search this template for sections relevant to the query: "${context?.query || ''}":
${JSON.stringify(template, null, 2)}

${context && context.query ? `Search query: ${context.query}` : 'No specific query provided. Find the most important sections.'}

Respond with a JSON object that contains:
1. "searchResults": An array of objects with "stageId", "taskId", "relevance" (a number between 0 and 1), and "matchedText" (the text that matched the query)
2. Sort the results by relevance, with the most relevant first.

Format your response as valid JSON without any additional text.`;
        break;
        
      default:
        throw new Error(`Unknown analysis type: ${analysisType}`);
    }
    
    try {
      logger.info({ analysisType }, 'analyzing template');
      
      // Generate text
      const response = await this.generateText(prompt, { 
        systemPrompt,
        temperature: 0.3, // Lower temperature for more deterministic results
        maxTokens: DEFAULT_MAX_TOKENS  // Standardized default   // Ensure enough tokens for comprehensive analysis
      });
      
      // Parse the response
      try {
        // Clean up the response text to handle markdown code blocks
        let cleanText = response.text;
        
        // Extract JSON from markdown code blocks if present
        const jsonMatch = cleanText.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) {
          cleanText = jsonMatch[1];
        } else {
          // If no code block found, try to clean up any markdown formatting
          cleanText = cleanText.replace(/```json\s*\n?/g, '').replace(/\n?```/g, '');
        }
        
        // Try to find JSON in the text if it's not properly formatted
        if (!cleanText.trim().startsWith('{') && !cleanText.trim().startsWith('[')) {
          const jsonStart = cleanText.indexOf('{');
          const jsonEnd = cleanText.lastIndexOf('}');
          
          if (jsonStart >= 0 && jsonEnd > jsonStart) {
            cleanText = cleanText.substring(jsonStart, jsonEnd + 1);
          }
        }
        
        logger.debug({ responseLength: cleanText.length }, 'cleaned LLM response for parsing');
        
        const parsedResponse = JSON.parse(cleanText);
        
        return {
          ...parsedResponse,
          rawResponse: response.text
        };
      } catch (parseError) {
        logger.error({ err: parseError, responseLength: response.text.length }, 'failed to parse LLM response');
        
        // Try one more time with a different provider if available
        if (this.provider.provider !== LLMProvider.ANTHROPIC_SDK) {
          logger.info({ fallbackProvider: LLMProvider.ANTHROPIC_SDK }, 'retrying template analysis with fallback provider');
          const anthropicProvider = this.providers.get(LLMProvider.ANTHROPIC_SDK);
          
          if (anthropicProvider && await anthropicProvider.isAvailable()) {
            const originalProvider = this.provider;
            this.provider = anthropicProvider;
            
            try {
              const retryResponse = await this.generateText(prompt, { 
                systemPrompt,
                temperature: 0.2, // Even lower temperature for retry
                maxTokens: DEFAULT_MAX_TOKENS  // Standardized default
              });
              
              // Process the retry response
              let retryCleanText = retryResponse.text;
              const retryJsonMatch = retryCleanText.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
              
              if (retryJsonMatch && retryJsonMatch[1]) {
                retryCleanText = retryJsonMatch[1];
              } else {
                retryCleanText = retryCleanText.replace(/```json\s*\n?/g, '').replace(/\n?```/g, '');
              }
              
              const retryParsedResponse = JSON.parse(retryCleanText);
              
              // Restore the original provider
              this.provider = originalProvider;
              
              return {
                ...retryParsedResponse,
                rawResponse: retryResponse.text
              };
            } catch (retryError) {
              // Restore the original provider
              this.provider = originalProvider;
              
              // Fall back to mock response
              logger.warn({ err: retryError }, 'retry failed, falling back to mock response');
              return this.getMockResponse(analysisType, template, context);
            }
          }
        }
        
        // Fall back to mock response
        return this.getMockResponse(analysisType, template, context);
      }
    } catch (error) {
      logger.error({ err: error, analysisType }, 'template analysis failed');
      return this.getMockResponse(analysisType, template, context);
    }
  }
  
  /**
   * Initialize MCP integration
   */
  async initializeMCP(): Promise<void> {
    logger.info('initializing MCP integration');

    try {
      await mcpService.initializeSDK();

      logger.info('MCP integration initialized successfully');
    } catch (error) {
      logger.error({ err: error }, 'failed to initialize MCP integration');
      // Don't throw error - continue without MCP if initialization fails
    }
  }

  /**
   * Get a mock response based on the analysis type
   */
  private getMockResponse(analysisType: string, template?: any, context?: any): any {
    logger.debug({ analysisType }, 'generating mock response');
    
    // Extract stage and task IDs from the template if available
    const stageIds: string[] = [];
    const taskIds: string[] = [];
    
    if (template) {
      // Extract stage IDs
      if (template.stages && Array.isArray(template.stages)) {
        template.stages.forEach((stage: any) => {
          if (stage.id) {
            stageIds.push(stage.id);
          }
          
          // Extract task IDs
          if (stage.tasks && Array.isArray(stage.tasks)) {
            stage.tasks.forEach((task: any) => {
              if (task.id) {
                taskIds.push(task.id);
              }
            });
          }
        });
      }
    }
    
    // Use extracted IDs or fallback to defaults
    const firstStageId = stageIds.length > 0 ? stageIds[0] : 'stage-1';
    const secondStageId = stageIds.length > 1 ? stageIds[1] : 'stage-2';
    const firstTaskId = taskIds.length > 0 ? taskIds[0] : 'task-1-1';
    const secondTaskId = taskIds.length > 1 ? taskIds[1] : 'task-1-2';
    const thirdTaskId = taskIds.length > 2 ? taskIds[2] : 'task-2-1';
    
    switch (analysisType) {
      case 'folding':
        return {
          foldedSections: [
            {
              stageId: firstStageId,
              taskIds: [firstTaskId, secondTaskId],
              reason: 'These tasks are less relevant to the current context.'
            }
          ],
          rawResponse: JSON.stringify({
            foldedSections: [
              {
                stageId: firstStageId,
                taskIds: [firstTaskId, secondTaskId],
                reason: 'These tasks are less relevant to the current context.'
              }
            ]
          })
        };
      case 'relationships':
        return {
          relatedSections: [
            {
              sourceStageId: firstStageId,
              sourceTaskId: firstTaskId,
              relatedStageId: secondStageId,
              relatedTaskId: thirdTaskId,
              relationshipType: 'dependency',
              confidence: 0.9
            }
          ],
          rawResponse: JSON.stringify({
            relatedSections: [
              {
                sourceStageId: firstStageId,
                sourceTaskId: firstTaskId,
                relatedStageId: secondStageId,
                relatedTaskId: thirdTaskId,
                relationshipType: 'dependency',
                confidence: 0.9
              }
            ]
          })
        };
      case 'suggestions':
        return {
          suggestions: [
            {
              stageId: firstStageId,
              taskId: firstTaskId,
              suggestion: 'Consider adding more details to this task.',
              type: 'modify',
              priority: 'medium'
            },
            {
              stageId: secondStageId,
              suggestion: 'Add a new task for quality assurance.',
              type: 'add',
              priority: 'high'
            }
          ],
          rawResponse: JSON.stringify({
            suggestions: [
              {
                stageId: firstStageId,
                taskId: firstTaskId,
                suggestion: 'Consider adding more details to this task.',
                type: 'modify',
                priority: 'medium'
              },
              {
                stageId: secondStageId,
                suggestion: 'Add a new task for quality assurance.',
                type: 'add',
                priority: 'high'
              }
            ]
          })
        };
      case 'search':
        const searchQuery = context?.query || 'default search';
        return {
          searchResults: [
            {
              stageId: firstStageId,
              taskId: firstTaskId,
              relevance: 0.9,
              matchedText: `This task matches your search for "${searchQuery}"`
            },
            {
              stageId: secondStageId,
              taskId: thirdTaskId,
              relevance: 0.7,
              matchedText: `This task partially matches your search for "${searchQuery}"`
            }
          ],
          rawResponse: JSON.stringify({
            searchResults: [
              {
                stageId: firstStageId,
                taskId: firstTaskId,
                relevance: 0.9,
                matchedText: `This task matches your search for "${searchQuery}"`
              },
              {
                stageId: secondStageId,
                taskId: thirdTaskId,
                relevance: 0.7,
                matchedText: `This task partially matches your search for "${searchQuery}"`
              }
            ]
          })
        };
      default:
        return {
          message: 'Mock response from LLM service',
          rawResponse: JSON.stringify({
            message: 'Mock response from LLM service'
          })
        };
    }
  }
}

// Create a singleton instance
export const llmService = new LLMService();
