import { Anthropic } from "@anthropic-ai/sdk";
import { BaseLLMProvider } from './base-provider';
import { LLMProvider, LLMRequestOptions, LLMResponse, DEFAULT_MAX_TOKENS, LLM_STOP_REASONS, LLMStopReason } from './types';
import { logger } from '@/lib/logger';
import { capabilitiesFor, FALLBACK_MODEL, SERVER_SIDE_FALLBACK_BETA } from './model-capabilities';

const log = logger.child({ domain: 'llm' });

const KNOWN_STOP_REASONS = new Set<string>(LLM_STOP_REASONS);

/**
 * Map a raw Anthropic `stop_reason` → the typed union WITHOUT laundering (WU-5, SDK Phase 2).
 * Replaces the two `stop_reason as LLMResponse['stopReason']` casts (one per response path) that
 * silently coerced anything — including an unmapped future reason — into the type. `null` ⇒ the
 * path's fallback; a KNOWN reason maps verbatim; an UNKNOWN reason is LOGGED (Protocol 10 — surfaced,
 * not silently coerced) and mapped to the fallback so a new SDK stop_reason can't crash a live run.
 */
export function normalizeStopReason(raw: string | null | undefined, fallback: LLMStopReason): LLMStopReason {
  if (raw == null) return fallback;
  if (KNOWN_STOP_REASONS.has(raw)) return raw as LLMStopReason;
  log.warn({ rawStopReason: raw }, 'unknown Anthropic stop_reason — using fallback; add to LLM_STOP_REASONS if real');
  return fallback;
}

/**
 * Build the Anthropic `messages.create` request body (WU-4, SDK Phase 2). ONE builder,
 * parameterized on `stream` — originally so generateText and the (since-deleted 2026-07-04)
 * streamText generator could never drift (they did before — the stream-only default
 * web_search, WU-0). Today's sole caller passes {stream:false} (generateText streams via
 * messages.stream(), which sets the flag itself); the option is kept for builder generality
 * and stays pinned by test-anthropic-request-builder B1.
 *
 * Model-conditional via the capability map (FAIL-LOUD on unknown — defense-in-depth even though
 * normalizeModelConfig already resolved caps upstream; the provider is the last write before the wire):
 *  - temperature/top_p: sent ONLY for models that accept them (Opus 4.7/4.8 + Fable 400 otherwise).
 *    The `?? 0.3` re-injection is GONE — THIS is what unblocks Opus 4.8.
 *  - thinking: adaptive `{type:'adaptive'}` when the legacy budget signal is set (opt-in preserved —
 *    zero templates set it today); omitted for always-on (Fable) and none (Haiku).
 *  - effort → `output_config.effort` (already clamped per tier upstream; undefined ⇒ omit).
 */
export function buildAnthropicRequest(
  mergedOptions: LLMRequestOptions,
  messages: any[],
  opts: { stream: boolean; fallbackModel: string }
): Anthropic.MessageCreateParams {
  const effectiveModel = mergedOptions.model || opts.fallbackModel;
  const cap = capabilitiesFor(effectiveModel);

  const req: Anthropic.MessageCreateParams = {
    model: effectiveModel,
    max_tokens: mergedOptions.maxTokens ?? DEFAULT_MAX_TOKENS,
    ...(cap.acceptsTemperature && mergedOptions.temperature != null ? { temperature: mergedOptions.temperature } : {}),
    // top_p only when temperature is absent (the API rejects both) AND the model accepts it.
    ...(cap.acceptsTemperature && mergedOptions.temperature == null && mergedOptions.topP != null ? { top_p: mergedOptions.topP } : {}),
    ...(mergedOptions.stopSequences?.length ? { stop_sequences: mergedOptions.stopSequences } : {}),
    // Prompt caching (Finding G, 2026-07-08, 3-specialist review 92% GREEN). Two breakpoints:
    //   1. system as a block array with cache_control — caches tools+system together (render
    //      order tools → system → messages).
    //   2. top-level cache_control (auto-cache) — the API places it on the LAST cacheable block
    //      server-side. Chosen over manual last-message placement because the loop SHARES content
    //      array references across turns: a mutated marker would leak into messageHistory,
    //      accumulate past the 4-breakpoint limit, and 400 every cached run at ~turn 4
    //      (agent-execution CRITICAL). Auto-cache never touches our message objects.
    // The value is pre-normalized at normalizeModelConfig (only {type:'ephemeral'} reaches here);
    // the guard below re-normalizes defensively for non-loop callers passing legacy shapes.
    system: mergedOptions.cacheControl
      ? [{
          type: 'text' as const,
          text: mergedOptions.systemPrompt || 'You are a helpful AI assistant.',
          cache_control: { type: 'ephemeral' as const },
        }]
      : (mergedOptions.systemPrompt || 'You are a helpful AI assistant.'),
    messages,
    ...(mergedOptions.cacheControl ? ({ cache_control: { type: 'ephemeral' } } as Record<string, unknown>) : {}),
    ...(opts.stream ? { stream: true } : {}),
    // effort → output_config.effort, but ONLY for models that accept effort (Haiku 4.5 errors on it).
    // Defense-in-depth: the chokepoint already omits/clamps it; this guards a caller that bypasses it.
    ...(mergedOptions.effort && cap.allowedEfforts.length > 0 ? { output_config: { effort: mergedOptions.effort } } : {}),
  };

  // tools (functions) — lifted verbatim from the former inline builders
  if (mergedOptions.functions && mergedOptions.functions.length > 0) {
    req.tools = mergedOptions.functions.map(func => ({
      name: func.name,
      description: func.description,
      input_schema: func.parameters,
    }));
    if (mergedOptions.functionCall) {
      if (mergedOptions.functionCall === 'auto') {
        req.tool_choice = { type: 'auto' };
      } else if (mergedOptions.functionCall === 'none') {
        req.tool_choice = { type: 'none' };
      } else if (typeof mergedOptions.functionCall === 'object') {
        req.tool_choice = { type: 'tool', name: mergedOptions.functionCall.name };
      }
    }
  }

  // web search tool — ONLY when explicitly configured (WU-0 removed the stream-only default)
  if (mergedOptions.webSearch) {
    if (!req.tools) req.tools = [];
    const webSearchTool: any = {
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: mergedOptions.webSearch.maxUses || 3,
    };
    if (mergedOptions.webSearch.allowedDomains && mergedOptions.webSearch.allowedDomains.length > 0) {
      webSearchTool.allowed_domains = mergedOptions.webSearch.allowedDomains;
    }
    if (mergedOptions.webSearch.blockedDomains && mergedOptions.webSearch.blockedDomains.length > 0) {
      webSearchTool.blocked_domains = mergedOptions.webSearch.blockedDomains;
    }
    if (mergedOptions.webSearch.userLocation) {
      webSearchTool.user_location = mergedOptions.webSearch.userLocation;
    }
    req.tools.push(webSearchTool);
  }

  // thinking — capability-driven (replaces the substring includes('sonnet-4'|'opus-4')). Opt-in
  // preserved: only when the legacy budget signal is present (mapped to adaptive; budget_tokens is
  // removed on 4.7/4.8). always-on (Fable) and none (Haiku) omit thinking entirely.
  if (cap.thinkingMode === 'adaptive' && mergedOptions.thinkingBudgetTokens) {
    req.thinking = { type: 'adaptive' };
  } else if (cap.thinkingMode === 'budget' && mergedOptions.thinkingBudgetTokens) {
    req.thinking = { type: 'enabled', budget_tokens: mergedOptions.thinkingBudgetTokens };
  }

  return req;
}

/**
 * Anthropic Claude LLM provider using the official SDK
 */
export class AnthropicSdkProvider extends BaseLLMProvider {
  /**
   * The provider name
   */
  provider = LLMProvider.ANTHROPIC_SDK;
  
  /**
   * Anthropic client
   */
  private client: Anthropic;
  
  /**
   * Model to use
   */
  private model: string;
  
  /**
   * Constructor
   *
   * C1 (task #85, 2026-04-16): removed `process.env.ANTHROPIC_API_KEY`
   * fallback. This provider no longer auto-seeds from environment; every
   * request must supply a per-user apiKey via `options.apiKey`. The
   * singleton `this.client` is now a placeholder — it exists to support
   * the class structure but should never successfully fulfill a request.
   *
   * Rationale: the env-var fallback silently routed unauthenticated
   * executions to whatever key happened to be in the environment, causing
   * cross-user billing (see Demo Financial Corp 2026-04-15). With this
   * removed, missing apiKey fails loud at `getClientForRequest` (C2 below)
   * OR at the engine's pre-flight check (B1 in agentExecutionEngine.ts).
   */
  constructor(apiKey?: string, model?: string) {
    super();
    // Do NOT read process.env.ANTHROPIC_API_KEY here — see C1 note above.
    // If an explicit apiKey is passed in (rare, used by legacy callers
    // that bypass per-request resolution), use it; otherwise construct a
    // placeholder client that will fail loud if used.
    this.client = new Anthropic({
      apiKey: apiKey || 'PLACEHOLDER_REQUIRES_PER_REQUEST_KEY',
    });
    this.model = model || process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
  }

  /**
   * Get the Anthropic client to use for a request.
   * Per task #85, every request MUST provide an explicit apiKey. Falling
   * back to `this.client` (env-var seeded) is now forbidden — the
   * singleton is a placeholder that would fail anyway, but we throw
   * earlier here with a clear message for forensics.
   *
   * C2: explicit throw happens BEFORE `new Anthropic(...)` because the
   * Anthropic SDK constructor itself auto-discovers from env when
   * `apiKey: undefined` is passed — defeating the purpose of C1. The
   * throw ensures no silent fallback path survives.
   */
  private getClientForRequest(options?: { apiKey?: string }): Anthropic {
    if (!options?.apiKey) {
      throw new Error(
        'AnthropicSdkProvider.getClientForRequest: apiKey required. No env-var fallback permitted (per task #85 triggering-user-only auth model). ' +
        'Callers must pass an explicit apiKey resolved from per-user UserSettings.'
      );
    }
    return new Anthropic({ apiKey: options.apiKey });
  }
  
  /**
   * Generate text from a prompt using Anthropic Claude
   */
  async generateText(prompt: string, options?: LLMRequestOptions): Promise<LLMResponse> {
    const mergedOptions = this.mergeOptions(options);
    
    try {
      log.debug({ provider: 'anthropic', model: mergedOptions.model || this.model }, 'generating text');

      // Prepare the messages for Anthropic API
      let messages;
      
      if (mergedOptions.messages && mergedOptions.messages.length > 0) {
        messages = mergedOptions.messages.map(msg => ({
          role: msg.role,
          content: Array.isArray(msg.content) ? msg.content : (msg.role === 'user' ? (msg.content || prompt) : msg.content),
        }));
        // NB (Finding G): the former per-message msg.cache_control passthrough and the
        // single-prompt MESSAGE-LEVEL cache_control below were deleted — message-level
        // cache_control is schema-INVALID on the API (it belongs on CONTENT BLOCKS or
        // top-level), so the legacy path 400'd rather than cached. Breakpoint placement
        // now lives entirely in buildAnthropicRequest (system block + top-level auto-cache).
      } else {
        messages = [
          {
            role: 'user' as const,
            content: prompt,
          }
        ];
      }
      
      // WU-4 + streaming-accumulate: ONE shared, model-conditional builder. The body carries
      // NO stream flag ({stream:false}) — messages.stream() sets it itself (a stray body flag
      // would be silently overwritten by the helper's spread, not rejected; kept out anyway as
      // builder hygiene, pinned by test-streaming-accumulate). buildAnthropicRequest(opts,
      // {stream:true}) has no remaining caller (streamText deleted 2026-07-04); the option is
      // kept for builder generality and stays pinned by test-anthropic-request-builder B1.
      const effectiveModel = mergedOptions.model || this.model;
      const requestOptions = buildAnthropicRequest(mergedOptions, messages, { stream: false, fallbackModel: this.model }) as Anthropic.MessageCreateParamsNonStreaming;

      // Make the request (per-request client for API key isolation; abort signal as SDK RequestOptions)
      const client = this.getClientForRequest(mergedOptions);
      // WU-10 (2026-07-02): Fable/Mythos opt into the server-side refusal-fallback BETA by default —
      // a policy decline is transparently re-served by FALLBACK_MODEL inside the same call (a decline
      // before any output isn't billed; the rescue bills at the fallback model's own rates). The
      // betas/fallbacks ride THIS per-request keyed client + request ONLY — never the placeholder
      // singleton (sec-ops C2). All other models stay on the standard route. BetaMessage is
      // field-compatible with Message for everything this parse reads (content/stop_reason/usage/
      // model) — hence the single cast; the beta `fallback` content block passes through the
      // type-filtered parse harmlessly and lands in rawContentBlocks as an audit marker.
      //
      // Streaming-accumulate (2026-07-04, reviewed 93%): stream().finalMessage() replaces
      // messages.create() — removes the SDK's non-streaming duration guard (the 21,333-token
      // ceiling; runtime-limits-discovery row 9) and its silent single-connection wait.
      // finalMessage() returns the SAME Anthropic.Message shape (input_json_delta assembled,
      // usage merged from message_start + message_delta incl. cache fields, serving-model
      // relabel on beta fallback rescues), so the parse below is unchanged. Do NOT route
      // a hand-rolled event loop — the deleted streamText's accumulator dropped
      // input_json_delta (tool args arrived as "{}"); the SDK accumulator is the only safe path. NOTE the timeout consequence: for streams the SDK bounds
      // time-to-first-headers only — the caller's abort signal (threaded below) plus the
      // execution watchdog are the ONLY end-to-end hang guards (review R4/R7).
      const requestCap = capabilitiesFor(effectiveModel);
      const sdkOpts = mergedOptions.signal ? { signal: mergedOptions.signal } : undefined;
      const response = (requestCap.serverSideFallback
        ? await client.beta.messages
            .stream(
              { ...requestOptions, betas: [SERVER_SIDE_FALLBACK_BETA], fallbacks: [{ model: FALLBACK_MODEL }] } as any,
              sdkOpts
            )
            .finalMessage()
        : await client.messages
            .stream(requestOptions, sdkOpts)
            .finalMessage()) as Anthropic.Message;

      // Process the response
      const textBlocks = response.content.filter(block => block.type === 'text');
      let responseText = '';
      
      // Combine all text blocks and track citations
      const citations: any[] = [];
      textBlocks.forEach(block => {
        if (block.type === 'text') {
          responseText += block.text;
          
          // Process citations if present
          if ('citations' in block && Array.isArray(block.citations)) {
            citations.push(...block.citations);
          }
        }
      });
      
      // Check if the response contains tool calls (function calls)
      const toolCalls = response.content.filter(block => block.type === 'tool_use');
      
      // Process web search queries (server_tool_use blocks)
      const searchQueries = response.content
        .filter(block => block.type === 'server_tool_use' && 'name' in block && block.name === 'web_search')
        .map(block => ({
          id: 'id' in block ? block.id : '',
          query: 'input' in block && block.input && typeof block.input === 'object' && 'query' in block.input ? 
                 String(block.input.query) : ''
        }));
      
      // Process web search results with better error handling
      const webSearchResults: Array<{
        url?: string;
        title?: string;
        pageAge?: string;
        encryptedContent?: string;
        toolUseId?: string;
        isError?: boolean;
        errorCode?: string;
      }> = [];
      
      // Process each web search result block
      for (const block of response.content) {
        if (block.type !== 'web_search_tool_result') continue;
        
        // Handle error cases
        if (block.content && 
            typeof block.content === 'object' && 
            !Array.isArray(block.content) &&
            'type' in block.content && 
            block.content.type === 'web_search_tool_result_error' &&
            'error_code' in block.content) {
          
          const errorCode = String(block.content.error_code);
          log.error({ errorCode }, 'web search error');
          
          webSearchResults.push({
            isError: true,
            errorCode,
            toolUseId: 'tool_use_id' in block ? block.tool_use_id : undefined
          });
          
          continue;
        }
        
        // Handle successful results
        if (block.content && Array.isArray(block.content)) {
          for (const result of block.content) {
            if (typeof result === 'object' && 
                result !== null && 
                'type' in result && 
                result.type === 'web_search_result') {
              
              webSearchResults.push({
                url: 'url' in result ? String(result.url) : '',
                title: 'title' in result ? String(result.title) : '',
                pageAge: 'page_age' in result ? String(result.page_age) : undefined,
                encryptedContent: 'encrypted_content' in result ? String(result.encrypted_content) : undefined,
                toolUseId: 'tool_use_id' in block ? block.tool_use_id : undefined
              });
            }
          }
        }
      }
      
      const result: LLMResponse = {
        text: responseText,
        provider: this.provider,
        metadata: {
          // D-G (2026-06-10): effectiveModel, NOT this.model — per-request model
          // overrides (the normal BYOK path) were misreported as the singleton
          // default in response metadata, surfacing as modelUsed:'default' in
          // result.json artifacts.
          // WU-10: on the fallback-capable path report the SERVING model (response.model —
          // Opus 4.8 when a Fable refusal was rescued), not the requested one; the named
          // field-leakage obligation. Elsewhere keep D-G's effectiveModel.
          model: requestCap.serverSideFallback && response.model ? response.model : effectiveModel,
          usage: response.usage
        }
      };
      
      // Add cache-related metadata
      if (response.usage) {
        result.usage = {
          inputTokens: response.usage.input_tokens || 0,
          outputTokens: response.usage.output_tokens || 0,
          // ⚠️ `?? undefined`, NOT `|| undefined` (fixed 2026-08-10). `||` mapped a GENUINE ZERO
          // to undefined, which persists as NULL in agent_executions — and since avg() skips NULLs
          // and every standing query filters `IS NOT NULL`, an execution that cached NOTHING
          // silently LEFT THE SAMPLE. Every cache average was therefore computed over survivors
          // only, and a partial cache collapse would have read as "unchanged".
          // Safe to change: all consumers coalesce (`|| 0` / `?? 0` in model-pricing.ts:95-96,
          // analytics summary.ts:235-236, agentic-tool-loop.ts:71-81), and
          // execution-artifacts.ts:128 `hasTokens` is an OR chain already satisfied by inputTokens.
          cacheReadTokens: response.usage.cache_read_input_tokens ?? undefined,
          cacheCreationTokens: response.usage.cache_creation_input_tokens ?? undefined
        };
      }
      
      // If there are tool calls, add them to the response
      if (toolCalls.length > 0) {
        result.functionCalls = toolCalls
          .filter((tc): tc is Extract<typeof tc, { type: 'tool_use' }> => tc.type === 'tool_use')
          .map(tc => ({
            id: tc.id,
            name: tc.name,
            arguments: JSON.stringify(tc.input)
          }));
        // Backward compat: singular = first
        result.functionCall = result.functionCalls[0];
      }

      // Expose stop_reason and raw content blocks for multi-turn tool conversations
      result.stopReason = normalizeStopReason(response.stop_reason, 'end_turn');
      result.rawContentBlocks = response.content;
      
      // If there are web search results, add them to the response
      if (webSearchResults.length > 0) {
        result.webSearchResults = webSearchResults;
      }
      
      // If there are citations, add them to the response
      if (citations.length > 0) {
        result.citations = citations;
      }
      
      // If there are search queries, add them to the response
      if (searchQueries.length > 0) {
        result.searchQueries = searchQueries;
      }
      
      return result;
    } catch (error) {
      log.error({ err: error }, 'error generating text');

      // Extract error details for web search errors
      let errorMessage = error instanceof Error ? error.message : 'Unknown error';
      let errorCode = 'unknown_error';
      let errorDetails = error;

      // Check if this is an Anthropic API error with web search error details
      if (error && typeof error === 'object') {
        // Handle BadRequestError from Anthropic SDK
        if ('error' in error && typeof error.error === 'object' && error.error !== null) {
          // C-1 fix (2026-07-04, required sibling to streaming-accumulate): on SDK 0.109
          // APIError.error is the FULL response envelope {type:'error', error:{type,message}} —
          // the old code read it directly, so every keyed discriminator below was DEAD
          // (apiError.type was always 'error', apiError.message always undefined → everything
          // fell through to unknown_error; found independently by 2 reviewers). Unwrap ONE
          // level to the inner error object, tolerating both shapes defensively. Verified
          // against sdk core/error.js:15 (this.error = envelope); proven by
          // test-streaming-accumulate 5.4 (real APIError.generate envelope, assertion flipped
          // in this commit).
          const envelope = error.error as any;
          const apiError = (typeof envelope.error === 'object' && envelope.error !== null) ? envelope.error : envelope;

          if ('type' in apiError && apiError.type === 'invalid_request_error') {
            // Check for web search tool errors in the message
            const errorMsg = 'message' in apiError ? String(apiError.message) : '';
            
            if (errorMsg.includes('web_search')) {
              errorCode = 'web_search_configuration_error';
              errorMessage = `Web search configuration error: ${errorMsg}`;
            }
          }
          
          // Handle web search tool result errors
          if ('type' in apiError && apiError.type === 'web_search_tool_result_error' && 'error_code' in apiError) {
            errorCode = String(apiError.error_code);
            
            // Provide more helpful messages based on error code
            switch (errorCode) {
              case 'too_many_requests':
                errorMessage = 'Web search rate limit exceeded. Please try again later.';
                break;
              case 'max_uses_exceeded':
                errorMessage = 'Maximum number of web searches exceeded for this request.';
                break;
              case 'query_too_long':
                errorMessage = 'Web search query exceeds maximum length.';
                break;
              case 'invalid_input':
                errorMessage = 'Invalid web search query parameter.';
                break;
              case 'unavailable':
                errorMessage = 'Web search service is currently unavailable.';
                break;
            }
          }

          // WU-7 (SDK Phase 2): context-window-exceeded → a categorized errorCode so the engine surfaces
          // errorCategory='CONTEXT_WINDOW_EXCEEDED' (GUI degradation banner) instead of a generic failure.
          // model_context_window_exceeded is NOT a stop_reason in the SDK union (Phase-0-deep) — it arrives
          // here as a 400 invalid_request_error.
          const ctxType = 'type' in apiError ? String((apiError as any).type) : '';
          const ctxMsg = 'message' in apiError ? String((apiError as any).message) : '';
          if (ctxType === 'model_context_window_exceeded' ||
              /context window|context length|prompt is too long|maximum.{0,20}context/i.test(ctxMsg)) {
            errorCode = 'CONTEXT_WINDOW_EXCEEDED';
            errorMessage = `Context window exceeded: ${ctxMsg || 'prompt + max_tokens exceeds the model context window'}`;
          }

          // WU-10 (2026-07-02): Fable 5 requires 30-day data retention — an org on ZDR (or any
          // retention below 30 days) gets 400 invalid_request_error on EVERY Fable request, even
          // with a perfectly valid payload. Map it to USER_CONFIG_REQUIRED (the same category the
          // missing-BYOK-key path uses) so the GUI shows the settings banner instead of an opaque
          // failure. Keyed on retention wording so other Fable 400s fall through untouched.
          else if (/data retention|zero data retention|retention (config|setting|requirement|policy)/i.test(ctxMsg)) {
            errorCode = 'USER_CONFIG_REQUIRED';
            errorMessage =
              `This model requires 30-day data retention on your Anthropic organization ` +
              `(zero-data-retention orgs cannot use Claude Fable 5). Adjust the org's retention ` +
              `configuration or select a different model. (${ctxMsg})`;
          }
        }
      }

      return {
        text: '',
        provider: this.provider,
        error: {
          message: errorMessage,
          code: errorCode,
          details: errorDetails
        }
      };
    }
  }

  // streamText DELETED 2026-07-04 (follow-ups item 4, AR-4 lean-DELETE): zero production
  // callers and a fatal latent bug (hand-rolled accumulator dropped input_json_delta — tool
  // args arrived as "{}" — and cache-usage fields). generateText() streams internally via
  // the SDK's MessageStream.finalMessage() accumulator. If a raw-chunk streamer is ever
  // needed, rebuild against the then-current SDK (llm-service.streamText falls back to
  // generateText for providers without the method).
  
  /**
   * Check if the provider is available (has valid API key)
   */
  async isAvailable(): Promise<boolean> {
    log.debug({ provider: 'anthropic' }, 'checking availability');

    try {
      // Make a simple request to check if the API key is valid
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        system: 'You are a helpful assistant.',
        messages: [
          {
            role: 'user' as const,
            content: 'Hello, this is a test message.'
          }
        ]
      });

      log.info({ provider: 'anthropic' }, 'provider available');
      return true;
    } catch (error) {
      log.error({ err: error, provider: 'anthropic' }, 'availability check failed');

      // Only allow in development mode if explicitly set in environment
      if (process.env.NODE_ENV === 'development' && process.env.ALLOW_INVALID_API_KEYS === 'true') {
        log.warn({ provider: 'anthropic' }, 'allowing provider despite invalid key (ALLOW_INVALID_API_KEYS=true)');
        return true;
      }

      return false;
    }
  }
}
