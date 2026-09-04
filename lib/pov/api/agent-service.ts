import { ExecutionStatus } from '@/components/poveditor/pov/context/types/EntityTypes';
import { fetchWithAuth } from '@/lib/utils/fetch-utils';
import { LLMProvider } from '@/lib/services/llm/types';
import * as sseUtils from '@/lib/utils/sse-utils'; // Direct import
import { povLogger } from '@/lib/logger';

/**
 * Interface for API response
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Interface for agent configuration
 */
export interface AgentConfig {
  role: string;
  prompt: string;
  parameters?: Record<string, any>;
  maxRetries?: number;
  timeout?: number;
}

/**
 * Interface for agent execution request
 */
export interface AgentExecutionRequest {
  taskId: string;
  agentConfig: AgentConfig;
  context?: Record<string, any>;
}

/**
 * Interface for agent execution response
 */
export interface AgentExecutionResponse {
  executionId: string;
  status: ExecutionStatus;
  startTime: string;
  endTime?: string;
  logs?: string[];
  artifacts?: AgentArtifact[];
  error?: string;
}

/**
 * Interface for agent artifact
 */
export interface AgentArtifact {
  id: string;
  name: string;
  type: string;
  content: string;
  createdAt: string;
}

/**
 * Interface for model information
 */
export interface ModelInfo {
  id: string;
  name: string;
}

/**
 * Interface for provider models
 */
export interface ProviderModels {
  provider: LLMProvider;
  models: ModelInfo[];
}

/**
 * Interface for agent execution status update
 */
export interface AgentStatusUpdate {
  executionId: string;
  status: ExecutionStatus;
  logs?: string[];
  artifacts?: AgentArtifact[];
  error?: string;
}

/**
 * Interface for web search citation
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
 * Interface for web search query
 */
export interface WebSearchQuery {
  /**
   * ID of the search query
   */
  id: string;
  
  /**
   * The search query text
   */
  query: string;
}

/**
 * Interface for web search result
 */
export interface WebSearchResult {
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
}

/**
 * Interface for streaming agent execution
 */
/** Runtime-assembled prompts from the `prompt_snapshot` SSE event (2026-06-10).
 *  Live-only: these are NOT persisted anywhere — this event is the only place
 *  the exact LLM input is visible. */
export interface PromptSnapshot {
  systemPrompt: string;
  userPrompt: string;
  systemPromptLength: number;
  userPromptLength: number;
}

/** Structured tool-result card from the `tool_result_card` SSE event (2026-06-10). */
export interface ToolResultCard {
  turn: number;
  tool: string;
  server?: string;
  success: boolean;
  durationMs: number;
  /** First 2000 chars of the stringified tool result (or error JSON). */
  preview: string;
  error?: string;
}

export interface StreamingAgentExecutionOptions {
  /**
   * Callback for handling text chunks
   */
  onTextChunk?: (text: string, isComplete: boolean) => void;
  
  /**
   * Callback for handling function calls
   */
  onFunctionCall?: (functionCall: { name: string; arguments: string }) => void;

  /**
   * Callback for structured tool-result cards (Monitoring activity feed,
   * 2026-06-10). Replaces the former markdown tool dumps in the text stream.
   */
  onToolResultCard?: (card: ToolResultCard) => void;

  /**
   * Callback for the runtime-assembled prompt snapshot (live-only, 2026-06-10).
   */
  onPromptSnapshot?: (snapshot: PromptSnapshot) => void;
  
  /**
   * Callback for handling web search results
   */
  onWebSearchResults?: (results: WebSearchResult[]) => void;
  
  /**
   * Callback for handling citations
   */
  onCitations?: (citations: WebSearchCitation[]) => void;
  
  /**
   * Callback for handling search queries
   */
  onSearchQueries?: (queries: WebSearchQuery[]) => void;
  
  /**
   * Callback for handling log updates
   */
  onLogUpdate?: (logs: string[]) => void;
  
  /**
   * Callback for handling execution updates
   */
  onExecutionUpdate?: (status: ExecutionStatus, endTime?: string) => void;
  
  /**
   * Callback for handling artifact creation
   */
  onArtifactCreated?: (artifact: { id: string; name: string; type: string; createdAt: string }) => void;
  
  /**
   * Callback for handling errors
   */
  onError?: (error: { message: string; code?: string; details?: any }) => void;
  
  /**
   * Callback for handling stream completion
   */
  onComplete?: () => void;
}

/**
 * Service for agent operations
 */
export const AgentService = {
/**
 * Execute an agent for a task
 * @param request Agent execution request
 * @returns Agent execution response
 */
async executeAgent(request: AgentExecutionRequest): Promise<ApiResponse<AgentExecutionResponse>> {
  try {
    // Validate request
    if (!request.taskId) {
      return {
        success: false,
        error: 'Task ID is required',
      };
    }
    
    if (!request.agentConfig) {
      return {
        success: false,
        error: 'Agent configuration is required',
      };
    }
    
    if (!request.agentConfig.role) {
      return {
        success: false,
        error: 'Agent role is required',
      };
    }
    
    // Make API request
    const response = await fetchWithAuth('/api/pov/agent/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    const data = await response.json();

    if (!response.ok) {
      // Handle specific error cases
      if (data.error?.code === 'NOT_FOUND') {
        return {
          success: false,
          error: 'Task not found. Please ensure the task exists.',
        };
      }
      
      if (data.error?.code === 'INVALID_REQUEST') {
        return {
          success: false,
          error: data.error.message || 'Invalid request. Please check your input.',
        };
      }
      
      return {
        success: false,
        error: data.error?.message || 'Failed to execute agent',
      };
    }

    return {
      success: true,
      data: data.data as AgentExecutionResponse,
    };
  } catch (error) {
    povLogger.error({ err: error }, 'agent execution failed');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred',
    };
  }
},

/**
 * Get the status of an agent execution
 * @param executionId Agent execution ID
 * @returns Agent execution response
 */
async getExecutionStatus(executionId: string): Promise<ApiResponse<AgentExecutionResponse>> {
  try {
    // Validate execution ID
    if (!executionId) {
      return {
        success: false,
        error: 'Execution ID is required',
      };
    }
    
    // Make API request
    const response = await fetchWithAuth(`/api/pov/agent/status/${executionId}`, {
      method: 'GET',
    });

    const data = await response.json();

    if (!response.ok) {
      // Handle specific error cases
      if (data.error?.code === 'NOT_FOUND') {
        return {
          success: false,
          error: 'Execution not found. Please ensure the execution ID is correct.',
        };
      }
      
      return {
        success: false,
        error: data.error?.message || 'Failed to get agent execution status',
      };
    }

    return {
      success: true,
      data: data.data as AgentExecutionResponse,
    };
  } catch (error) {
    povLogger.error({ err: error }, 'failed to get execution status');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred',
    };
  }
},

/**
 * Cancel an agent execution
 * @param executionId Agent execution ID
 * @returns Success status
 */
async cancelExecution(executionId: string): Promise<ApiResponse<void>> {
  try {
    // Validate execution ID
    if (!executionId) {
      return {
        success: false,
        error: 'Execution ID is required',
      };
    }
    
    // Make API request
    const response = await fetchWithAuth(`/api/pov/agent/cancel/${executionId}`, {
      method: 'POST',
    });

    if (!response.ok) {
      const data = await response.json();
      
      // Handle specific error cases
      if (data.error?.code === 'NOT_FOUND') {
        return {
          success: false,
          error: 'Execution not found. Please ensure the execution ID is correct.',
        };
      }
      
      if (data.error?.code === 'INVALID_STATE') {
        return {
          success: false,
          error: data.error.message || 'Cannot cancel execution in its current state.',
        };
      }
      
      return {
        success: false,
        error: data.error?.message || 'Failed to cancel agent execution',
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    povLogger.error({ err: error }, 'failed to cancel execution');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred',
    };
  }
},

/**
 * Get artifacts for an agent execution
 * @param executionId Agent execution ID
 * @returns Agent artifacts
 */
async getArtifacts(executionId: string): Promise<ApiResponse<AgentArtifact[]>> {
  try {
    // Validate execution ID
    if (!executionId) {
      return {
        success: false,
        error: 'Execution ID is required',
      };
    }
    
    // Make API request
    const response = await fetchWithAuth(`/api/pov/agent/artifacts/${executionId}`, {
      method: 'GET',
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error?.message || 'Failed to get agent artifacts',
      };
    }

    return {
      success: true,
      data: data.data as AgentArtifact[],
    };
  } catch (error) {
    povLogger.error({ err: error }, 'failed to get artifacts');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred',
    };
  }
},

/**
 * Download an artifact
 * @param executionId Agent execution ID
 * @param artifactId Artifact ID
 * @returns Artifact content
 */
async downloadArtifact(executionId: string, artifactId: string): Promise<ApiResponse<Blob>> {
  try {
    // Validate parameters
    if (!executionId) {
      return {
        success: false,
        error: 'Execution ID is required',
      };
    }
    
    if (!artifactId) {
      return {
        success: false,
        error: 'Artifact ID is required',
      };
    }
    
    // Make API request
    const response = await fetchWithAuth(`/api/pov/agent/artifacts/${executionId}/${artifactId}/download`, {
      method: 'GET',
    });

    if (!response.ok) {
      // For non-JSON responses (like 404 Not Found), handle differently
      if (response.headers.get('content-type')?.includes('application/json')) {
        const data = await response.json();
        return {
          success: false,
          error: data.error?.message || 'Failed to download artifact',
        };
      } else {
        return {
          success: false,
          error: `Failed to download artifact: ${response.status} ${response.statusText}`,
        };
      }
    }

    const blob = await response.blob();

    return {
      success: true,
      data: blob,
    };
  } catch (error) {
    povLogger.error({ err: error }, 'failed to download artifact');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred',
    };
  }
},

/**
 * Get available agent roles
 * @returns Available agent roles
 */
async getAgentRoles(): Promise<ApiResponse<string[]>> {
  try {
    // Make API request
    const response = await fetchWithAuth('/api/pov/agent/roles', {
      method: 'GET',
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error?.message || 'Failed to get agent roles',
      };
    }

    return {
      success: true,
      data: data.data as string[],
    };
  } catch (error) {
    povLogger.error({ err: error }, 'failed to get agent roles');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred',
    };
  }
},

/**
 * Execute an agent for a task with streaming response
 * @param request Agent execution request
 * @param options Streaming options
 * @returns Execution ID if successful, null if failed
 */
async executeAgentWithStreaming(
  request: AgentExecutionRequest,
  options: StreamingAgentExecutionOptions
): Promise<string | null> {
  try {
    // Validate request
    if (!request.taskId) {
      if (options.onError) {
        options.onError({ message: 'Task ID is required', code: 'INVALID_REQUEST' });
      }
      return null;
    }
    
    if (!request.agentConfig) {
      if (options.onError) {
        options.onError({ message: 'Agent configuration is required', code: 'INVALID_REQUEST' });
      }
      return null;
    }
    
    if (!request.agentConfig.role) {
      if (options.onError) {
        options.onError({ message: 'Agent role is required', code: 'INVALID_REQUEST' });
      }
      return null;
    }
    
    povLogger.debug({ taskId: request.taskId, role: request.agentConfig.role }, 'executing agent with streaming');
    
    // Make API request with streaming and proper SSE headers
    const response = await fetchWithAuth('/api/pov/agent/execute/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      },
      body: JSON.stringify(request),
    });
    
    povLogger.debug({ status: response.status }, 'stream response received');
    
    if (!response.ok) {
      // For non-streaming error responses
      if (response.headers.get('content-type')?.includes('application/json')) {
        const errorData = await response.json();
        if (options.onError) {
          options.onError(errorData.error || { message: 'Failed to execute agent' });
        }
        return null;
      } else {
        if (options.onError) {
          options.onError({ message: `Failed to execute agent: ${response.status} ${response.statusText}` });
        }
        return null;
      }
    }
    
    // Check if the response body is available
    if (!response.body) {
      if (options.onError) {
        options.onError({ message: 'Response body is null' });
      }
      return null;
    }
    
    // Process the stream using SSE utilities
    const reader = response.body.getReader();
    let executionId: string | null = null;
    
    await sseUtils.processSSEStream(
      reader,
      (event: any) => {
        // Handle raw events
        if (event.type === 'done') {
          if (options.onComplete) {
            options.onComplete();
          }
          return;
        }
        
        // Directly process events assuming they are in our server's format,
        // as mapAnthropicEvent was redundant for events from our own stream endpoint.
        
        // The 'event' parameter here has:
        // event.type: typically "message" (or the value from an "event:" SSE line if present)
        // event.data: the parsed JSON object from the "data:" SSE line

        if (event.data && typeof event.data === 'object') {
          const { type, ...restOfEventData } = event.data; // 'type' here is from our server's JSON payload
                                                          // e.g., "execution_started", "text_chunk"
          
          switch (type) {
            case 'execution_started':
              executionId = restOfEventData.executionId;
              if (options.onExecutionUpdate) {
                options.onExecutionUpdate(restOfEventData.status, restOfEventData.startTime);
              }
              break;
              
            case 'text_chunk':
              if (options.onTextChunk) {
                options.onTextChunk(restOfEventData.text, restOfEventData.isComplete);
              }
              break;
              
            case 'function_call':
              if (options.onFunctionCall) {
                options.onFunctionCall(restOfEventData.functionCall);
              }
              break;

            case 'tool_result_card':
              if (options.onToolResultCard) {
                options.onToolResultCard(restOfEventData as ToolResultCard);
              }
              break;

            case 'prompt_snapshot':
              if (options.onPromptSnapshot) {
                options.onPromptSnapshot(restOfEventData as PromptSnapshot);
              }
              break;
              
            case 'web_search_results':
              if (options.onWebSearchResults) {
                options.onWebSearchResults(restOfEventData.webSearchResults);
              }
              break;
              
            case 'citations':
              if (options.onCitations) {
                options.onCitations(restOfEventData.citations);
              }
              break;
              
            case 'search_queries':
              if (options.onSearchQueries) {
                options.onSearchQueries(restOfEventData.searchQueries);
              }
              break;
              
            case 'log_update':
              if (options.onLogUpdate) {
                options.onLogUpdate(restOfEventData.logs);
              }
              break;
              
            case 'execution_update':
              if (options.onExecutionUpdate) {
                options.onExecutionUpdate(restOfEventData.status, restOfEventData.endTime);
              }
              break;
              
            case 'artifact_created':
              if (options.onArtifactCreated) {
                options.onArtifactCreated(restOfEventData.artifact);
              }
              break;
              
            case 'error':
              if (options.onError) {
                options.onError(restOfEventData.error);
              }
              break;
          }
        }
      },
      (error: Error) => {
        povLogger.error({ err: error }, 'SSE stream processing error');
        if (options.onError) {
          options.onError({ message: error.message });
        }
      },
      () => {
        if (options.onComplete) {
          options.onComplete();
        }
      }
    );
    
    return executionId;
  } catch (error) {
    povLogger.error({ err: error }, 'streaming agent execution failed');
    if (options.onError) {
      options.onError({ message: error instanceof Error ? error.message : 'An unknown error occurred' });
    }
    return null;
  }
},

/**
 * Get available LLM models for each provider
 * @returns Available models by provider
 */
async getAvailableModels(): Promise<ApiResponse<ProviderModels[]>> {
  try {
    // Make API request
    const response = await fetchWithAuth('/api/llm/models', {
      method: 'GET',
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error?.message || 'Failed to get available models',
      };
    }

    return {
      success: true,
      data: data.data as ProviderModels[],
    };
  } catch (error) {
    povLogger.error({ err: error }, 'failed to get available models');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred',
    };
  }
},
};
