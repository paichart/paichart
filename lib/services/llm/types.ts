/**
 * Available LLM providers
 */
export enum LLMProvider {
  ANTHROPIC_SDK = 'anthropic_sdk', // Provider using the official Anthropic SDK
  // GEMINI_SDK removed 2026-08-05 (Steve's call — Gemini was unused: zero user settings,
  // templates or tasks referenced it). The enum is deliberately KEPT at one value rather
  // than collapsed away, so re-adding a provider stays a small change. NOTE: this is the
  // LLM-provider Gemini only — Gemini as an MCP OAuth *client* (lib/auth/**) is a live
  // integration with its own state handling and is intentionally untouched.
}

/**
 * Message with cache control for multi-turn conversations
 */
export interface MessageWithCacheControl {
  /**
   * Message role
   */
  role: 'user' | 'assistant';
  
  /**
   * Message content
   */
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'tool_result'; tool_use_id: string; content?: string | Array<{ type: 'text'; text: string }>; is_error?: boolean }
    | { type: 'tool_use'; id: string; name: string; input: unknown }
  >;
  
  /**
   * Cache control
   */
  cache_control?: {
    /**
     * Cache type
     */
    type: 'ephemeral' | 'persistent';
    
    /**
     * Cache ID for persistent caches
     */
    id?: string;
  };
}

/**
 * Web search citation
 */
export interface WebSearchCitation {
  /**
   * Citation type
   */
  type: 'web_search_result_location';
  
  /**
   * URL of the cited source
   */
  url: string;
  
  /**
   * Title of the cited source
   */
  title: string;
  
  /**
   * Encrypted index for multi-turn conversations
   */
  encrypted_index: string;
  
  /**
   * Cited text (up to 150 characters)
   */
  cited_text: string;
}

/**
 * Token usage tracking interface
 */
export interface TokenUsageTracking {
  /**
   * Number of input tokens
   */
  inputTokens: number;
  
  /**
   * Number of output tokens
   */
  outputTokens: number;
  
  /**
   * Total tokens used
   */
  totalTokens: number;
  
  /**
   * Number of tokens read from cache
   */
  cacheReadTokens?: number;
  
  /**
   * Number of tokens created in cache
   */
  cacheCreationTokens?: number;
  
  /**
   * Estimated cost for this request
   */
  estimatedCost?: number;
  
  /**
   * Request timestamp
   */
  timestamp: Date;
  
  /**
   * Request type for categorization
   */
  requestType?: 'mcp_workflow' | 'template_analysis' | 'agent_execution' | 'general';
}

/**
 * Enhanced token management options
 */
export interface TokenManagementOptions {
  /**
   * Maximum tokens to generate (enhanced with dynamic allocation)
   */
  maxTokens?: number;
  
  /**
   * Minimum tokens to reserve for response
   */
  minTokens?: number;
  
  /**
   * Dynamic token allocation based on request complexity
   */
  dynamicAllocation?: {
    /**
     * Enable dynamic token allocation
     */
    enabled: boolean;
    
    /**
     * Base token allocation
     */
    baseTokens: number;
    
    /**
     * Additional tokens per complexity factor
     */
    complexityMultiplier: number;
    
    /**
     * Maximum tokens for dynamic allocation
     */
    maxDynamicTokens: number;
  };
  
  /**
   * Token optimization settings
   */
  optimization?: {
    /**
     * Enable token usage optimization
     */
    enabled: boolean;
    
    /**
     * Compress prompts to save tokens
     */
    compressPrompts?: boolean;
    
    /**
     * Use prompt caching when available
     */
    usePromptCache?: boolean;
    
    /**
     * Truncate context if needed
     */
    allowTruncation?: boolean;
  };
  
  /**
   * Token budget tracking
   */
  budget?: {
    /**
     * Maximum tokens per request
     */
    maxPerRequest: number;
    
    /**
     * Maximum tokens per hour
     */
    maxPerHour?: number;
    
    /**
     * Maximum tokens per day
     */
    maxPerDay?: number;
    
    /**
     * Alert threshold (percentage of budget)
     */
    alertThreshold?: number;
  };
}

/**
 * LLM request options
 */
export interface LLMRequestOptions {
  /**
   * Provider to use for this request
   * If not specified, the default provider will be used
   */
  provider?: LLMProvider;
  
  /**
   * Model to use for this request
   * If not specified, the provider's default model will be used
   */
  model?: string;

  /**
   * API key to use for this request (per-request isolation).
   * If not specified, the provider's configured key will be used.
   * Prevents cross-user key leakage in the singleton provider.
   */
  apiKey?: string;

  /**
   * Maximum number of tokens to generate
   * Enhanced with MCP-optimized defaults
   */
  maxTokens?: number;
  
  /**
   * Enhanced token management options
   */
  tokenManagement?: TokenManagementOptions;
  
  /**
   * Temperature for controlling randomness (0.0 to 1.0)
   * Lower values make output more deterministic, higher values more creative
   */
  temperature?: number;
  
  /**
   * Top-p sampling (0.0 to 1.0)
   * Controls diversity by limiting to top tokens that add up to top_p probability mass
   */
  topP?: number;
  
  /**
   * Stop sequences that will cause the model to stop generating
   */
  stopSequences?: string[];
  
  /**
   * System prompt to guide the model's behavior
   */
  systemPrompt?: string;
  
  /**
   * Whether to use the proxy endpoint for API calls
   */
  useProxy?: boolean;
  
  /**
   * Custom endpoint for the proxy
   */
  proxyEndpoint?: string;
  
  /**
   * Retry options for API calls
   */
  retry?: {
    /**
     * Maximum number of retries
     */
    maxRetries: number;
    
    /**
     * Whether to use a different provider as fallback
     */
    useFallbackProvider?: boolean;
    
    /**
     * Fallback provider to use if the primary provider fails
     */
    fallbackProvider?: LLMProvider;
  };
  
  /**
   * Function definitions for function calling
   */
  functions?: LLMFunction[];
  
  /**
   * Function call behavior
   * - 'auto': Let the model decide when to call functions
   * - 'none': Never call functions
   * - { name: string }: Always call the specified function
   */
  functionCall?: 'auto' | 'none' | { name: string };
  
  /**
   * Whether to stream the response
   */
  stream?: boolean;
  
  /**
   * Prompt caching (Finding G, 2026-07-08). Post-normalization this is either
   * {type:'ephemeral'} (cache ON — the default for engine executions via
   * DEFAULT_MODEL_PARAMS) or undefined (OFF). 'persistent'/'id' were removed —
   * they are not real Anthropic API values and would 400 on the wire
   * (template-system F5a, prompt-caching-G review).
   */
  cacheControl?: {
    type: 'ephemeral';
  };
  
  /**
   * Messages with cache control for multi-turn conversations
   */
  messages?: MessageWithCacheControl[];
  
  /**
   * Budget for extended thinking in tokens (Claude 3.7+ models)
   */
  thinkingBudgetTokens?: number;
  /**
   * Reasoning effort → `output_config.effort` (low|medium|high|xhigh|max). The provider
   * resolves the model-appropriate value via the capability map and omits it for models
   * that don't accept effort (e.g. Haiku 4.5). LLM-call param, template-default +
   * task-overridable. (SDK Phase 2, WU-2)
   */
  effort?: import('./model-capabilities').EffortLevel;

  /**
   * Abort signal for execution-level timeouts.
   * When aborted, the Anthropic SDK cancels the in-flight HTTP request.
   */
  signal?: AbortSignal;

  /**
   * Web search tool configuration
   */
  webSearch?: {
    /**
     * Maximum number of searches to perform
     */
    maxUses?: number;
    
    /**
     * Only include results from these domains
     */
    allowedDomains?: string[];
    
    /**
     * Never include results from these domains
     */
    blockedDomains?: string[];
    
    /**
     * User location for localized search results
     */
    userLocation?: {
      /**
       * Location type (must be 'approximate')
       */
      type: 'approximate';
      
      /**
       * City name
       */
      city: string;
      
      /**
       * Region or state
       */
      region: string;
      
      /**
       * Country
       */
      country: string;
      
      /**
       * IANA timezone ID
       */
      timezone: string;
    };
  };
}

/**
 * Function definition for LLM function calling
 */
export interface LLMFunction {
  /**
   * Function name
   */
  name: string;
  
  /**
   * Function description
   */
  description: string;
  
  /**
   * Function parameters schema
   */
  parameters: {
    /**
     * Schema type (must be 'object')
     */
    type: 'object';
    
    /**
     * Parameter properties
     */
    properties: Record<string, {
      /**
       * Parameter type
       */
      type: string;
      
      /**
       * Parameter description
       */
      description: string;
      
      /**
       * Enum values for string parameters
       */
      enum?: string[];
      
      /**
       * Items schema for array parameters
       */
      items?: any;
      
      /**
       * Whether the parameter is required
       */
      required?: boolean;
    }>;
    
    /**
     * Required parameter names
     */
    required?: string[];
  };
}

/**
 * The Anthropic stop reasons we map (WU-5, SDK Phase 2). The runtime array is the SINGLE source —
 * the union type is derived from it so the membership check in normalizeStopReason() and the
 * LLMResponse/LLMStreamChunk field unions can never drift (the exact drift class this task fights).
 */
export const LLM_STOP_REASONS = ['end_turn', 'max_tokens', 'stop_sequence', 'tool_use', 'pause_turn', 'refusal'] as const;
export type LLMStopReason = typeof LLM_STOP_REASONS[number];

/**
 * LLM response
 */
export interface LLMResponse {
  /**
   * The generated text
   */
  text: string;
  
  /**
   * The provider that generated the response
   */
  provider: LLMProvider;
  
  /**
   * Additional metadata about the response
   */
  metadata?: Record<string, any>;
  
  /**
   * Whether this is a mock response
   */
  isMock?: boolean;
  
  /**
   * Error information if the request failed
   */
  error?: {
    /**
     * Error message
     */
    message: string;
    
    /**
     * Error code
     */
    code?: string;
    
    /**
     * Additional error details
     */
    details?: any;
  };
  
  /**
   * Usage information for the request
   */
  usage?: {
    /**
     * Number of input tokens
     */
    inputTokens: number;
    
    /**
     * Number of output tokens
     */
    outputTokens: number;
    
    /**
     * Number of tokens read from cache
     */
    cacheReadTokens?: number;
    
    /**
     * Number of tokens created in cache
     */
    cacheCreationTokens?: number;
  };
  
  /**
   * Thinking output from the model (Claude 3.7+ models)
   */
  thinking?: string;

  /**
   * Function call information if the model called a function (backward compat: first of functionCalls)
   */
  functionCall?: {
    id?: string;
    name: string;
    arguments: string;
  };

  /**
   * All function calls from this response (Anthropic can return multiple tool_use blocks)
   */
  functionCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;

  /**
   * Stop reason from the LLM API
   */
  stopReason?: LLMStopReason;

  /**
   * Raw content blocks from the LLM response (needed for multi-turn tool conversations)
   */
  // WU-8 (SDK Phase 2): `unknown[]`, not `any[]` — kills the implicit-any field-access hazard. NOT
  // Anthropic.ContentBlock[]: this is provider-agnostic and every consumer only checks existence then
  // threads the blocks back to the API verbatim (no typed field access), so the SDK type would couple
  // the abstraction for zero benefit. The provider builds typed blocks locally before assigning here.
  rawContentBlocks?: unknown[];

  /**
   * Web search results if the model used the web search tool
   */
  webSearchResults?: {
    /**
     * URL of the source page
     */
    url?: string;

    /**
     * Title of the source page
     */
    title?: string;
    
    /**
     * When the site was last updated
     */
    pageAge?: string;
    
    /**
     * Encrypted content for citations
     */
    encryptedContent?: string;
    
    /**
     * Tool use ID that generated this result
     */
    toolUseId?: string;
    
    /**
     * Whether this result is an error
     */
    isError?: boolean;
    
    /**
     * Error code if this result is an error
     */
    errorCode?: string;
  }[];
  
  /**
   * Citations from web search results
   */
  citations?: WebSearchCitation[];
  
  /**
   * Web search queries that were executed
   */
  searchQueries?: {
    /**
     * ID of the search query
     */
    id: string;
    
    /**
     * The search query text
     */
    query: string;
  }[];
}

/**
 * LLM stream chunk for streaming responses
 */
export interface LLMStreamChunk {
  /**
   * The chunk of text
   */
  text: string;
  
  /**
   * The provider that generated the chunk
   */
  provider: LLMProvider;
  
  /**
   * Whether this is the final chunk
   */
  isComplete: boolean;
  
  /**
   * Function call information if the model called a function
   */
  functionCall?: {
    id?: string;
    name: string;
    arguments: string;
  };

  /**
   * All function calls from this chunk/response (multiple tool_use blocks possible)
   */
  functionCalls?: Array<{
    id?: string;
    name: string;
    arguments: string;
  }>;

  /**
   * Why the model stopped generating (on final chunk only).
   * Critical for agentic loops: 'tool_use' means continue, 'refusal' means abort.
   */
  stopReason?: LLMStopReason;

  /**
   * Raw content blocks from the model response (on final chunk only).
   * Needed for multi-turn message history construction in agentic tool loops.
   */
  // WU-8 (SDK Phase 2): `unknown[]`, not `any[]` — kills the implicit-any field-access hazard. NOT
  // Anthropic.ContentBlock[]: this is provider-agnostic and every consumer only checks existence then
  // threads the blocks back to the API verbatim (no typed field access), so the SDK type would couple
  // the abstraction for zero benefit. The provider builds typed blocks locally before assigning here.
  rawContentBlocks?: unknown[];

  /**
   * Web search results if the model used the web search tool
   */
  webSearchResults?: {
    /**
     * URL of the source page
     */
    url?: string;
    
    /**
     * Title of the source page
     */
    title?: string;
    
    /**
     * When the site was last updated
     */
    pageAge?: string;
    
    /**
     * Encrypted content for citations
     */
    encryptedContent?: string;
    
    /**
     * Tool use ID that generated this result
     */
    toolUseId?: string;
    
    /**
     * Whether this result is an error
     */
    isError?: boolean;
    
    /**
     * Error code if this result is an error
     */
    errorCode?: string;
  }[];
  
  /**
   * Error information if the request failed
   */
  error?: {
    /**
     * Error message
     */
    message: string;
    
    /**
     * Error code
     */
    code?: string;
    
    /**
     * Additional error details
     */
    details?: any;
  };
  
  /**
   * Usage information for the request
   */
  usage?: {
    /**
     * Number of input tokens
     */
    inputTokens: number;
    
    /**
     * Number of output tokens
     */
    outputTokens: number;
    
    /**
     * Number of tokens read from cache
     */
    cacheReadTokens?: number;
    
    /**
     * Number of tokens created in cache
     */
    cacheCreationTokens?: number;
  };
  
  /**
   * Thinking output from the model (Claude 3.7+ models)
   */
  thinking?: string;
  
  /**
   * Citations from web search results
   */
  citations?: WebSearchCitation[];
  
  /**
   * Web search queries that were executed
   */
  searchQueries?: {
    /**
     * ID of the search query
     */
    id: string;
    
    /**
     * The search query text
     */
    query: string;
  }[];
}

/**
 * Interface for LLM service providers
 */
export interface LLMServiceProvider {
  /**
   * The provider name
   */
  provider: LLMProvider;
  
  /**
   * Generate text from a prompt
   */
  generateText(prompt: string, options?: LLMRequestOptions): Promise<LLMResponse>;
  
  /**
   * Stream text from a prompt
   */
  streamText?(prompt: string, options?: LLMRequestOptions): AsyncGenerator<LLMStreamChunk, void, unknown>;
  
  /**
   * Check if the provider is available (has valid API keys, etc.)
   */
  isAvailable(): Promise<boolean>;
  
  // NOTE: setModel() and setApiKey() were removed (Mar 2026) to prevent
  // singleton mutation bugs. Model and API key are now passed per-request
  // via LLMRequestOptions.model and LLMRequestOptions.apiKey.
}

/**
 * Proxy configuration for LLM providers
 */
export interface ProxyConfig {
  /**
   * Whether to use the proxy
   */
  enabled: boolean;
  
  /**
   * The endpoint for the proxy
   */
  endpoint: string;
  
  /**
   * Additional headers to include in the request
   */
  headers?: Record<string, string>;
}

/**
 * Template analysis request
 */
export interface TemplateAnalysisRequest {
  /**
   * The template content to analyze
   */
  template: any;
  
  /**
   * The type of analysis to perform
   */
  analysisType: 'folding' | 'relationships' | 'suggestions' | 'search';
  
  /**
   * Additional context for the analysis
   */
  context?: Record<string, any>;
}

/**
 * Template analysis response
 */
export interface TemplateAnalysisResponse {
  /**
   * Sections to fold
   */
  foldedSections?: {
    stageId: string;
    taskIds: string[];
    reason: string;
  }[];
  
  /**
   * Related sections
   */
  relatedSections?: {
    sourceStageId: string;
    sourceTaskId: string;
    relatedStageId: string;
    relatedTaskId: string;
    relationshipType: string;
    confidence: number;
  }[];
  
  /**
   * Suggestions for improvements
   */
  suggestions?: {
    stageId?: string;
    taskId?: string;
    suggestion: string;
    type: 'add' | 'modify' | 'remove' | 'general';
    priority: 'high' | 'medium' | 'low';
  }[];
  
  /**
   * Search results
   */
  searchResults?: {
    stageId: string;
    taskId: string;
    relevance: number;
    matchedText: string;
  }[];
  
  /**
   * Raw response from the LLM
   */
  rawResponse?: string;
}

/**
 * Model information interface
 */
export interface ModelInfo {
  /**
   * Display name of the model
   */
  name: string;
  
  /**
   * Description of the model's capabilities
   */
  description: string;
  
  /**
   * Maximum number of tokens the model can generate
   */
  maxTokens: number;
  
  /**
   * Context window size in tokens
   */
  contextWindow?: number;
  
  /**
   * Whether the model supports streaming
   */
  supportsStreaming?: boolean;
  
  /**
   * Whether the model supports function calling
   */
  supportsFunctions?: boolean;
  
  /**
   * Whether the model supports prompt caching
   */
  supportsPromptCache?: boolean;
}

/**
 * Map a model registry → dropdown `{ id, name }` options. The SINGLE mapping used by both the
 * `/api/llm/models` route and the client model dropdowns (AgentBuilderForm / ModelParametersSection /
 * AgentConfigTab), so a model bump in `anthropicModels` reaches the UI with no
 * hardcoded list to drift (the Opus 4.6→4.8 drift, 2026-06-19).
 */
export const toModelOptions = (registry: Record<string, ModelInfo>): { id: string; name: string }[] =>
  Object.entries(registry).map(([id, info]) => ({ id, name: info.name }));

// `maxTokens` = real Anthropic OUTPUT-token ceiling; `contextWindow` = real input
// window (per the claude-api skill, 2026-06-18): Opus 4.x = 128K output / 1M context,
// Sonnet 4.6 = 64K output / 1M context, Haiku 4.5 = 64K output / 200K context. The
// previous flat `8192` / `200_000` were stale. The runtime maxTokens clamp does NOT
// read this table (it uses maxOutputTokensForModel in runtime-limits.ts); these values
// are accurate for any future consumer (e.g. a model-picker reading from the registry).
export const anthropicModels: Record<string, ModelInfo> = {
  // WU-10 (2026-07-02): Sonnet 5 + Fable 5 added (the Claude 5 release wave). Registry order =
  // picker display order (toModelOptions). Request shaping per model lives in model-capabilities.ts.
  // claude-sonnet-4-6 REMOVED from the registry 2026-07-02 (Steve's call — Sonnet 5 supersedes it in
  // the picker). The model is STILL SERVED by Anthropic, so its branch in model-capabilities.ts MUST
  // stay — capabilitiesFor THROWS on an unknown model, so any stored config naming it would fail hard.
  // Registry = what we OFFER; capability map = what we can SHAPE. Re-add here only to re-offer it.
  //
  // ⚠️ CLAIMANT RE-MEASURED 2026-08-10: this said "~9 seeded templates still store it". That is now
  // ZERO templates — plausibly rewritten by the model-tier hoist (b27bf8fe), which rewrote every
  // template's modelParameters. The branch survives on exactly ONE claimant: a single OPEN task
  // (2026-06-04, "Design Security Architecture") whose metadata pins it. Re-check with:
  //   SELECT metadata->'modelParameters'->>'model', count(*) FROM tasks
  //   WHERE metadata->'modelParameters'->>'model' IS NOT NULL GROUP BY 1;
  // If that task is closed or repointed, this branch has no claimant left.
  'claude-sonnet-5': {
    name: 'Claude Sonnet 5',
    description: 'Near-Opus quality on coding and agentic work at Sonnet cost',
    maxTokens: 128000,
    contextWindow: 1_000_000,
    supportsStreaming: true,
    supportsFunctions: true,
    supportsPromptCache: true,
  },
  // Opus 5 added 2026-08-05, superseding claude-opus-4-8 in this registry (Steve's call — same
  // de-pick pattern as sonnet-4-6 above). Drop-in at 4.8's pricing ($5/$25, so model-pricing.ts's
  // `includes('opus')` key is already correct) and 4.8's 128K/1M limits.
  // claude-opus-4-8's branch in model-capabilities.ts is RETAINED under the same rule as sonnet-4-6:
  // capabilitiesFor THROWS on an unknown model, so a stored config naming it must still resolve.
  // Registry = what we OFFER; capability map = what we can SHAPE.
  //
  // ⚠️ BOTH ORIGINAL REASONS RE-CHECKED 2026-08-10; ONE WAS FALSE AND THE OTHER HAD DECAYED:
  //  (a) "~30 seeded templates still store it" → **ZERO templates** (see the sonnet-4-6 note above —
  //      the model-tier hoist rewrote them). One claimant remains: a COMPLETED task from 2026-06-24.
  //      A completed task never re-runs, so this branch is arguably the weakest-held in the file.
  //  (b) "it is FALLBACK_MODEL … deleting that branch would break the rescue path itself" → **FALSE,
  //      and it was the stronger-sounding of the two.** The rescue path resolves
  //      `capabilitiesFor(effectiveModel)` — the model we are CALLING (Fable 5 / Opus 5).
  //      FALLBACK_MODEL only ever enters the request as a STRING in `fallbacks: [{ model }]`
  //      (anthropic-sdk-provider.ts), and the SERVER performs the re-serve. We never resolve
  //      capabilities for it, so deleting this branch would not touch the rescue path.
  // Recorded because a confident, specific, wrong justification is worse than none: it is precisely
  // what stops the next reader from re-checking. (Same failure as the stale "engine + stream +
  // reactor" comment corrected in agentic-tool-loop.ts on the same day — see 620b9062.)
  'claude-opus-5': {
    name: 'Claude Opus 5',
    description: 'Complex agentic coding and deep reasoning, at half the cost of Fable 5',
    maxTokens: 128000,
    contextWindow: 1_000_000,
    supportsStreaming: true,
    supportsFunctions: true,
    supportsPromptCache: true,
  },
  'claude-fable-5': {
    name: 'Claude Fable 5',
    description: 'Most capable model for the hardest reasoning and long-horizon agentic work (premium pricing; requires 30-day data retention)',
    maxTokens: 128000,
    contextWindow: 1_000_000,
    supportsStreaming: true,
    supportsFunctions: true,
    supportsPromptCache: true,
  },
  'claude-haiku-4-5': {
    name: 'Claude Haiku 4.5',
    description: 'Fastest model for quick answers and lightweight tasks',
    maxTokens: 64000,
    contextWindow: 200_000,
    supportsStreaming: true,
    supportsFunctions: true,
    supportsPromptCache: true,
  },
};

/**
 * MCP-optimized default token settings
 */
export const MCPTokenDefaults = {
  /**
   * Default maximum tokens for MCP workflows
   */
  MCP_WORKFLOW_MAX_TOKENS: 6000,
  
  /**
   * Default maximum tokens for template analysis
   */
  TEMPLATE_ANALYSIS_MAX_TOKENS: 4000,
  
  /**
   * Default maximum tokens for agent execution
   */
  AGENT_EXECUTION_MAX_TOKENS: 5000,
  
  /**
   * Default maximum tokens for general requests
   */
  GENERAL_MAX_TOKENS: 2000,
  
  /**
   * Standardized default for all agent operations.
   * History: 6000 → 8000 (Phase 0 truncation) → 24000 (2026-07-16, truncation-stall R1).
   * It is a CEILING, not a target (normalizeModelConfig does Math.min(source.maxTokens, outputCeiling);
   * a turn that needs 4K still bills 4K), so raising it is free for runs that fit and prevents the
   * final SYNTHESIZE/PLAN turn from exhausting the budget mid-thinking. Root cause: claude-sonnet-5
   * runs adaptive extended thinking BY DEFAULT (billed as output, counts against max_tokens); at 8000
   * a heavy final turn could consume the whole budget in thinking → stop_reason:max_tokens, zero text.
   * 24000 clears the observed worst case (a successful synthesis used 14089 output) with margin and
   * sits well under every model's outputCeiling (Sonnet/Haiku 64K, Opus/Fable 128K) so it never clips.
   * Panel: cline_docs/reviews/truncation-stall-2026-07-16/synthesis.md (R1).
   */
  STANDARD_AGENT_LIMIT: 24000,
  
  /**
   * Minimum tokens to reserve for response
   */
  MIN_RESPONSE_TOKENS: 500,
  
  /**
   * Dynamic allocation settings
   */
  DYNAMIC_ALLOCATION: {
    BASE_TOKENS: 2000,
    COMPLEXITY_MULTIPLIER: 500,
    MAX_DYNAMIC_TOKENS: 8000,
  },
  
  /**
   * Budget settings
   */
  BUDGET: {
    // ⚠️ DEAD CONFIG — zero consumers (verified 2026-08-20, maxtokens-sonnet-flip review):
    // only MAX_PER_HOUR/MAX_PER_DAY are read (mcpService.ts). NOT a generation ceiling and
    // unrelated to DEFAULT_MAX_TOKENS despite the coincidental old value; the live per-call
    // MCP gate is MCP_WORKFLOW_MAX_TOKENS in mcpService.ts:399-413. Kept only to avoid type
    // churn; delete on next BUDGET refactor.
    MAX_PER_REQUEST: 8000,
    MAX_PER_HOUR: 4000000,   // 4M/hr (doubled 2026-04-28 from 2M after Trial A 2026-04-27 budget exhaustion).
    // 4-child synthesis pipelines with context chaining + bloated chained-context tool-call records can
    // burn close to the prior 2M cap; the doubling provides headroom for late-phase children (Editor +
    // Reviewer) that previously self-flagged "MCP tool calls blocked by hourly token budget exhaustion"
    // and fell back to chained-context-only mode. Empirical measurement after deploy will confirm
    // whether 4M is right; if pipelines still saturate, the structural fix is the result.json bloat
    // (chained-context tool-call records cascading downstream — Editor was 5.2MB on the Trial A run).
    MAX_PER_DAY: 20000000,   // 20M/day — kept at 20M for now (Steve's request was specifically to double
    // the hourly rate). Note: the new 4M/hr × 24h = 96M ceiling means the daily cap binds first if a
    // single user runs at full hourly burn for >5 hours. Prior 2M/hr × 10hr matched the daily ceiling
    // exactly; the ratio is now tighter. Daily has never been observed firing in production, so leaving
    // it at 20M for now and revisiting if it surfaces.
    ALERT_THRESHOLD: 80,
  },
} as const;

/**
 * Standardized default max tokens for use across the entire system
 * Import this constant wherever token limits are needed
 */
export const DEFAULT_MAX_TOKENS = MCPTokenDefaults.STANDARD_AGENT_LIMIT;

/**
 * Shared default for TUNING model parameters only — the knobs for which a silent
 * default is acceptable. `model` is deliberately NOT here: model is load-bearing
 * (which LLM runs) and must resolve from the template/task or FAIL LOUD, never a
 * buried literal (2026-06-18 model-resolution cleanup; see runtime-limits-discovery
 * + cline_docs/reviews/model-resolution-cleanup-2026-06-18/).
 *
 * temperature 0.3 is the de-facto production value — every agent-template seed pins
 * 0.3 and it's the `normalizeModelConfig` fallback. (The old `0.7` lived only in the
 * synthetic config builders, which no longer inject defaults.)
 */
export const DEFAULT_MODEL_PARAMS = {
  temperature: 0.3,
  // Prompt caching default-ON for engine executions (Finding G, 3-specialist review 92% GREEN,
  // 2026-07-08): the agentic loop re-sends ~45-55K stable prefix tokens per turn; ephemeral
  // caching (5-min TTL, writes 1.25x, reads 0.1x) cuts root-execution input ~78%. Explicit
  // opt-out = cacheControl:false on the task/template (survives ?? because false is not null).
  cacheControl: { type: 'ephemeral' },
} as const;
