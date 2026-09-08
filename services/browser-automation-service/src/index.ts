/**
 * Browser Automation Service - Native MCP Server
 *
 * Proper MCP protocol server using SDK 1.25.3 for Hub orchestration.
 * Uses SSE transport for compatibility with MCP SDK clients.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express, { Request, Response } from 'express';
import { z } from 'zod';

/** Inline transport boundary guard - Docker services cannot import from lib/ */
function ensureObject(value: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  if (value == null) return fallback;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed;
    } catch { /* fallback */ }
  }
  return fallback;
}
import { BrowserPoolManager } from './browser/pool-manager.js';
import { checkHealth } from './health/check.js';

// Tool imports
import { scrapePage, scrapePageSchema } from './tools/scrape-page.js';
import { fillForm, fillFormSchema } from './tools/fill-form.js';
import { clickElement, clickElementSchema } from './tools/click-element.js';
import { takeScreenshot, takeScreenshotSchema } from './tools/take-screenshot.js';
import { generatePdf, generatePdfSchema } from './tools/generate-pdf.js';
import { runScript, runScriptSchema } from './tools/run-script.js';
import { traceSession, traceSessionSchema } from './tools/trace-session.js';

const PORT = process.env.BROWSER_SERVICE_PORT || 3100;

// Tool registry
const tools = {
  scrape_page: {
    name: 'scrape_page',
    description: 'Extract data from web pages using CSS selectors with optional pagination',
    inputSchema: scrapePageSchema,
    handler: scrapePage
  },
  fill_form: {
    name: 'fill_form',
    description: 'Fill and optionally submit web forms with field mappings',
    inputSchema: fillFormSchema,
    handler: fillForm
  },
  click_element: {
    name: 'click_element',
    description: 'Click an element on the page and optionally capture screenshots',
    inputSchema: clickElementSchema,
    handler: clickElement
  },
  take_screenshot: {
    name: 'take_screenshot',
    description: 'Capture screenshots of web pages or specific elements',
    inputSchema: takeScreenshotSchema,
    handler: takeScreenshot
  },
  generate_pdf: {
    name: 'generate_pdf',
    description: 'Generate PDF documents from web pages with configurable settings',
    inputSchema: generatePdfSchema,
    handler: generatePdf
  },
  run_script: {
    name: 'run_script',
    description: 'Execute JavaScript code in the browser context',
    inputSchema: runScriptSchema,
    handler: runScript
  },
  trace_session: {
    name: 'trace_session',
    description: 'Record and manage browser session traces for debugging',
    inputSchema: traceSessionSchema,
    handler: traceSession
  }
};

// Utility function to convert Zod schema to JSON Schema
function zodToJsonSchema(schema: z.ZodType<any>): object {
  const zodDef = (schema as any)._def;

  if (zodDef.typeName === 'ZodObject') {
    const properties: Record<string, object> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(zodDef.shape())) {
      properties[key] = zodToJsonSchema(value as z.ZodType<any>);
      if (!((value as any)._def.typeName === 'ZodOptional')) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined
    };
  }

  if (zodDef.typeName === 'ZodString') return { type: 'string' };
  if (zodDef.typeName === 'ZodNumber') return { type: 'number' };
  if (zodDef.typeName === 'ZodBoolean') return { type: 'boolean' };
  if (zodDef.typeName === 'ZodArray') return { type: 'array', items: zodToJsonSchema(zodDef.type) };
  if (zodDef.typeName === 'ZodOptional') return zodToJsonSchema(zodDef.innerType);
  if (zodDef.typeName === 'ZodDefault') return zodToJsonSchema(zodDef.innerType);
  if (zodDef.typeName === 'ZodRecord') return { type: 'object', additionalProperties: zodToJsonSchema(zodDef.valueType) };
  if (zodDef.typeName === 'ZodEnum') return { type: 'string', enum: zodDef.values };

  return { type: 'any' };
}

// Create MCP Server
const mcpServer = new Server(
  {
    name: 'browser-automation-service',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tools/list request
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  console.log('[MCP] Handling tools/list request');
  return {
    tools: Object.values(tools).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.inputSchema)
    }))
  };
});

// Handle tools/call request
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name: toolName, arguments: args } = request.params;
  console.log(`[MCP] Handling tools/call request for: ${toolName}`);

  const tool = tools[toolName as keyof typeof tools];
  if (!tool) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ error: `Tool not found: ${toolName}`, availableTools: Object.keys(tools) })
        }
      ],
      isError: true
    };
  }

  try {
    // Strip _context before Zod validation, preserve for future use
    const safeArgs = ensureObject(args);
    const { _context, ...toolArgs } = safeArgs;
    const validatedInput = tool.inputSchema.parse(toolArgs);

    // Acquire browser from pool
    const poolManager = BrowserPoolManager.getInstance();
    const { id, page, context } = await poolManager.acquire();

    console.log(`[MCP] Executing ${toolName} with browser ${id}`);

    try {
      let result;

      // Special handling for trace_session (needs context, not page)
      if (toolName === 'trace_session') {
        result = await (tool.handler as typeof traceSession)(context, validatedInput as any);
      } else {
        result = await (tool.handler as any)(page, validatedInput);
      }

      // Release browser back to pool
      await poolManager.release(id);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (executionError: any) {
      // Release browser even on error
      await poolManager.release(id);
      throw executionError;
    }
  } catch (error: any) {
    console.error(`[MCP] Error executing ${toolName}:`, error);

    if (error instanceof z.ZodError) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'Validation error', details: error.errors })
          }
        ],
        isError: true
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ error: error.message })
        }
      ],
      isError: true
    };
  }
});

// Express app for SSE transport and health checks
const app = express();
app.use(express.json({ limit: '50mb' }));

// Track active SSE transports
const activeTransports = new Map<string, SSEServerTransport>();

// SSE endpoint for MCP protocol - this is what the Hub's SSEClientTransport connects to
app.get('/sse', async (req: Request, res: Response) => {
  console.log('[MCP] New SSE connection request');

  // Create SSE transport for this connection
  const transport = new SSEServerTransport('/message', res);

  // Get sessionId (available immediately after construction)
  const sessionId = transport.sessionId;
  activeTransports.set(sessionId, transport);

  console.log(`[MCP] SSE transport created with sessionId: ${sessionId}`);

  // Set up close handler BEFORE connect to catch early closes
  let connectionClosed = false;
  const closePromise = new Promise<void>((resolve) => {
    req.on('close', () => {
      connectionClosed = true;
      console.log(`[MCP] SSE connection closed: ${sessionId}`);
      activeTransports.delete(sessionId);
      resolve();
    });
  });

  // Connect the MCP server to this transport
  // Note: connect() calls start() automatically, so don't call start() separately
  try {
    console.log(`[MCP] Calling mcpServer.connect for ${sessionId}...`);
    await mcpServer.connect(transport);
    console.log(`[MCP] Server connected to transport: ${sessionId}, connectionClosed=${connectionClosed}`);
  } catch (error) {
    console.error(`[MCP] Failed to connect transport ${sessionId}:`, error);
    activeTransports.delete(sessionId);
    return; // Only return on error
  }

  // Check if connection closed during connect
  if (connectionClosed) {
    console.log(`[MCP] Connection was closed during connect phase for ${sessionId}`);
    return;
  }

  console.log(`[MCP] Waiting for connection close for ${sessionId}...`);

  // CRITICAL: Keep the handler alive until the client disconnects
  // If we return, Express will close the response and break SSE
  await closePromise;
  console.log(`[MCP] Handler exiting for ${sessionId}`);
});

// Message endpoint for SSE transport (client posts messages here)
app.post('/message', async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  console.log(`[MCP] Received message on /message endpoint, sessionId: ${sessionId || 'none'}`);
  console.log(`[MCP] Active transports: ${[...activeTransports.keys()].join(', ')}`);
  console.log(`[MCP] Request body:`, JSON.stringify(req.body).substring(0, 200));

  if (!sessionId) {
    // If no sessionId, try to find any active transport (single client scenario)
    if (activeTransports.size === 1) {
      const [id, transport] = [...activeTransports.entries()][0];
      console.log(`[MCP] No sessionId provided, using single active transport: ${id}`);
      try {
        // CRITICAL: Pass req.body since express.json() already consumed the stream
        await transport.handlePostMessage(req, res, req.body);
        console.log(`[MCP] handlePostMessage completed successfully for ${id}`);
        return;
      } catch (error: any) {
        console.error('[MCP] Error handling message:', error.message, error.stack);
        res.status(500).json({ error: error.message });
        return;
      }
    }
    console.error('[MCP] No sessionId provided and multiple/zero active transports');
    res.status(400).json({ error: 'sessionId required when multiple connections active' });
    return;
  }

  // Find the transport for this session
  const transport = activeTransports.get(sessionId);
  if (!transport) {
    console.error(`[MCP] No transport found for session: ${sessionId}`);
    console.error(`[MCP] Available sessions: ${[...activeTransports.keys()].join(', ')}`);
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  try {
    console.log(`[MCP] Calling handlePostMessage for session ${sessionId}`);
    // CRITICAL: Pass req.body since express.json() already consumed the stream
    await transport.handlePostMessage(req, res, req.body);
    console.log(`[MCP] handlePostMessage completed successfully for ${sessionId}`);
  } catch (error: any) {
    console.error('[MCP] Error handling message:', error.message, error.stack);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/health', async (_req: Request, res: Response) => {
  const health = await checkHealth();
  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json({
    ...health,
    mcpConnections: activeTransports.size
  });
});

// Legacy REST endpoints for backward compatibility (optional)
app.get('/tools', (_req: Request, res: Response) => {
  const toolList = Object.values(tools).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.inputSchema)
  }));

  res.json({
    tools: toolList,
    version: '1.0.0',
    transport: 'mcp-sse'
  });
});

// Graceful shutdown
async function shutdown() {
  console.log('[BrowserAutomationService] Shutting down...');

  // Close all active transports
  for (const [id, transport] of activeTransports) {
    console.log(`[MCP] Closing transport: ${id}`);
    try {
      await transport.close();
    } catch (e) {
      // Ignore close errors
    }
  }
  activeTransports.clear();

  // Shutdown browser pool
  const poolManager = BrowserPoolManager.getInstance();
  await poolManager.shutdown();

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
app.listen(PORT, () => {
  console.log(`[BrowserAutomationService] MCP Server listening on port ${PORT}`);
  console.log(`[BrowserAutomationService] SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`[BrowserAutomationService] Health check: http://localhost:${PORT}/health`);
  console.log(`[BrowserAutomationService] Available tools: ${Object.keys(tools).join(', ')}`);
  console.log(`[BrowserAutomationService] MCP SDK version: 1.25.3`);
});

export { app, mcpServer, tools };
