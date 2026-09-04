import { LLMProvider, LLMRequestOptions, LLMResponse, LLMServiceProvider, DEFAULT_MAX_TOKENS } from './types';
import { logger } from '@/lib/logger';

/**
 * Base abstract class for LLM service providers
 */
export abstract class BaseLLMProvider implements LLMServiceProvider {
  /**
   * The provider name
   */
  abstract provider: LLMProvider;
  
  /**
   * Default options for the provider
   */
  protected defaultOptions: LLMRequestOptions = {
    maxTokens: DEFAULT_MAX_TOKENS,  // = STANDARD_AGENT_LIMIT (24000 since R1 2026-07-16); value lives in types.ts, never here
    temperature: 0.3,
    stopSequences: [],
    systemPrompt: 'You are a helpful assistant that analyzes template structures and provides insights.'
  };
  
  /**
   * Generate text from a prompt
   */
  abstract generateText(prompt: string, options?: LLMRequestOptions): Promise<LLMResponse>;
  
  /**
   * Check if the provider is available (has valid API keys, etc.)
   */
  abstract isAvailable(): Promise<boolean>;
  
  /**
   * Merge default options with provided options
   */
  protected mergeOptions(options?: LLMRequestOptions): LLMRequestOptions {
    return {
      ...this.defaultOptions,
      ...options
    };
  }
  
  /**
   * Format the prompt with system instructions
   */
  protected formatPrompt(prompt: string, systemPrompt?: string): string {
    if (!systemPrompt) {
      return prompt;
    }
    
    return `${systemPrompt}\n\n${prompt}`;
  }
  
  /**
   * Handle errors from the LLM API
   */
  protected handleError(error: any): never {
    logger.child({ module: `${this.provider}Provider` }).error({ err: error }, 'LLM API error');
    throw new Error(`Error calling ${this.provider} API: ${error.message || 'Unknown error'}`);
  }
}
