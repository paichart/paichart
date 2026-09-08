/**
 * Trace Session Tool
 *
 * Records and manages browser session traces for debugging.
 */

import { BrowserContext } from 'playwright';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const traceSessionSchema = z.object({
  action: z.enum(['start', 'stop', 'get']),
  traceId: z.string().optional()
});

export type TraceSessionInput = z.infer<typeof traceSessionSchema>;

export interface TraceEvent {
  type: string;
  timestamp: string;
  data?: any;
}

export interface TraceSessionOutput {
  success: boolean;
  traceId?: string;
  events?: TraceEvent[];
  artifacts?: {
    tracePath?: string;
    size?: number;
  };
  errors?: string[];
}

// In-memory trace storage (for demo; production would use persistent storage)
const activeTraces = new Map<string, {
  context: BrowserContext;
  startTime: Date;
  events: TraceEvent[];
}>();

// BC24 FIX: Sanitize traceId to prevent path traversal
function sanitizeTraceId(traceId: string): string {
  return traceId.replace(/[^a-zA-Z0-9_\-]/g, '');
}

export async function traceSession(
  context: BrowserContext,
  input: TraceSessionInput
): Promise<TraceSessionOutput> {
  try {
    // BC24 FIX: Validate traceId before use in path operations
    if (input.traceId) {
      const sanitized = sanitizeTraceId(input.traceId);
      if (sanitized !== input.traceId) {
        return {
          success: false,
          errors: ['Invalid traceId: contains disallowed characters']
        };
      }
    }

    switch (input.action) {
      case 'start': {
        const traceId = `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const tracePath = path.join(os.tmpdir(), `${traceId}.zip`);

        // Start Playwright tracing
        await context.tracing.start({
          screenshots: true,
          snapshots: true,
          sources: true
        });

        activeTraces.set(traceId, {
          context,
          startTime: new Date(),
          events: [{
            type: 'trace_started',
            timestamp: new Date().toISOString()
          }]
        });

        return {
          success: true,
          traceId,
          events: [{ type: 'trace_started', timestamp: new Date().toISOString() }]
        };
      }

      case 'stop': {
        if (!input.traceId) {
          return {
            success: false,
            errors: ['traceId is required for stop action']
          };
        }

        const trace = activeTraces.get(input.traceId);
        if (!trace) {
          return {
            success: false,
            errors: [`Trace not found: ${input.traceId}`]
          };
        }

        const tracePath = path.join(os.tmpdir(), `${input.traceId}.zip`);

        // Stop tracing and save
        await trace.context.tracing.stop({ path: tracePath });

        trace.events.push({
          type: 'trace_stopped',
          timestamp: new Date().toISOString(),
          data: { duration: Date.now() - trace.startTime.getTime() }
        });

        // Get file size
        const stats = fs.statSync(tracePath);

        return {
          success: true,
          traceId: input.traceId,
          events: trace.events,
          artifacts: {
            tracePath,
            size: stats.size
          }
        };
      }

      case 'get': {
        if (!input.traceId) {
          return {
            success: false,
            errors: ['traceId is required for get action']
          };
        }

        const trace = activeTraces.get(input.traceId);
        if (!trace) {
          // Check if trace file exists
          const tracePath = path.join(os.tmpdir(), `${input.traceId}.zip`);
          if (fs.existsSync(tracePath)) {
            const stats = fs.statSync(tracePath);
            return {
              success: true,
              traceId: input.traceId,
              artifacts: {
                tracePath,
                size: stats.size
              }
            };
          }

          return {
            success: false,
            errors: [`Trace not found: ${input.traceId}`]
          };
        }

        return {
          success: true,
          traceId: input.traceId,
          events: trace.events
        };
      }

      default:
        return {
          success: false,
          errors: [`Unknown action: ${input.action}`]
        };
    }
  } catch (error: any) {
    return {
      success: false,
      errors: [error.message]
    };
  }
}
