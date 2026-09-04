/**
 * Utility functions for Server-Sent Events (SSE)
 */
// import { FEATURES } from '../features'; // No longer needed

/**
 * Interface for SSE event
 */
export interface SSEEvent {
  type: string;
  data: any;
}

/**
 * Process SSE events from a stream
 * @param reader ReadableStreamDefaultReader to read from
 * @param onEvent Callback for each event
 * @param onError Callback for errors
 * @param onComplete Callback when stream is complete
 */
export async function processSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: SSEEvent) => void,
  onError?: (error: Error) => void,
  onComplete?: () => void
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        // console.log('[SSE] Stream complete'); // Removed DEBUG log
        if (onComplete) {
          onComplete();
        }
        break;
      }
      
      // Decode the chunk and add it to the buffer
      const decodedChunk = decoder.decode(value, { stream: true });
      // console.log('[SSE] Received chunk:', decodedChunk.substring(0, 100) + (decodedChunk.length > 100 ? '...' : '')); // Removed DEBUG log
      buffer += decodedChunk;
      
      // Process the buffer line by line
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      // Group lines into events (event: type + data: json)
      let currentEvent = '';
      let currentData = '';
      
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          // Start of a new event
          if (currentEvent && currentData) {
            // Process the previous event
            processEvent(currentEvent, currentData, onEvent);
          }
          
          // Set the new event type
          currentEvent = line.slice(7);
        } else if (line.startsWith('data: ')) {
          // Data for the current event
          currentData = line.slice(6);
        } else if (line.trim() === '') {
          // Empty line indicates end of an event
          if (currentData) { // If there is any data accumulated, process it
            // Default to "message" event type if no explicit "event:" line was found
            processEvent(currentEvent || "message", currentData, onEvent);
          }
          // Reset for the next event
          currentEvent = '';
          currentData = '';
        }
      }
      // After the loop, process any remaining buffered data if the stream ended mid-message
      // This might be needed if the stream doesn't end with a double newline.
      // However, your server sends \n\n, so the above should cover most cases.
      // For robustness, one might add:
      // if (currentData) {
      //   processEvent(currentEvent || "message", currentData, onEvent);
      // }
    }
  } catch (error) {
    // console.error('[SSE] Error reading stream:', error); // Removed DEBUG log
    if (onError) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Process a single SSE event
 * @param eventType Event type
 * @param eventData Event data
 * @param onEvent Callback for the event
 */
function processEvent(
  eventType: string,
  eventData: string,
  onEvent: (event: SSEEvent) => void
): void {
  // console.log('[SSE] Processing event:', eventType); // Removed DEBUG log
  // console.log('[SSE] Event data:', eventData); // Removed DEBUG log
  
  if (eventData === '[DONE]') {
    // console.log('[SSE] Stream done'); // Removed DEBUG log
    onEvent({ type: 'done', data: null });
    return;
  }
  
  try {
    const parsed = JSON.parse(eventData);
    onEvent({ type: eventType, data: parsed });
  } catch (error) {
    // console.error('[SSE] Error parsing event data:', error); // Removed DEBUG log
    // console.error('[SSE] Raw data:', eventData); // Removed DEBUG log
    // Still dispatch the event with the raw data
    onEvent({ type: eventType, data: eventData });
  }
}

/**
 * Map Anthropic event types to our custom event types
 * @param event SSE event
 * @returns Mapped event
 */
export function mapAnthropicEvent(event: SSEEvent): SSEEvent | null {
  if (event.type === 'done') {
    return event;
  }
  
  // For non-Anthropic events, return as is
  if (!event.data || typeof event.data !== 'object' || !event.data.type) {
    return event;
  }
  
  const { type, ...data } = event.data;
  
  switch (type) {
    case 'message_start':
      return {
        type: 'execution_started',
        data: {
          executionId: data.message?.id,
          status: 'RUNNING',
          startTime: new Date().toISOString()
        }
      };
      
    case 'content_block_delta':
      if (data.delta?.type === 'text_delta') {
        return {
          type: 'text_chunk',
          data: {
            text: data.delta.text,
            isComplete: false
          }
        };
      } else if (data.delta?.type === 'thinking_delta') {
        return {
          type: 'thinking',
          data: {
            thinking: data.delta.thinking
          }
        };
      }
      break;
      
    case 'content_block_start':
      if (data.content_block?.type === 'tool_use') {
        return {
          type: 'function_call',
          data: {
            functionCall: {
              name: data.content_block.name,
              arguments: data.content_block.input || '{}'
            }
          }
        };
      } else if (data.content_block?.type === 'web_search_tool_result') {
        return {
          type: 'web_search_results',
          data: {
            webSearchResults: data.content_block.content || []
          }
        };
      } else if (data.content_block?.type === 'server_tool_use' && 
                data.content_block.name === 'web_search') {
        return {
          type: 'search_queries',
          data: {
            searchQueries: [{ 
              id: data.content_block.id || '', 
              query: data.content_block.input?.query || '' 
            }]
          }
        };
      }
      break;
      
    case 'message_delta':
      return {
        type: 'execution_update',
        data: {
          status: data.delta?.stop_reason === 'end_turn' ? 'SUCCESS' : 'FAILED',
          endTime: new Date().toISOString()
        }
      };
      
    case 'message_stop':
      return {
        type: 'text_chunk',
        data: {
          text: '',
          isComplete: true
        }
      };
  }
  
  // If no mapping found, return null
  return null;
}
