import { z } from 'zod';
import { FIELD_LIMITS } from './field-limits';

const MCPServerConfigSchema = z.object({
  name: z.string().min(1, 'Server name is required').max(FIELD_LIMITS.ID, 'Name too long'),
  description: z.string().max(200, 'Description too long').optional(),
  version: z.string().default('1.0.0'),
  transport: z.object({
    type: z.enum(['stdio', 'websocket', 'sse']), // Updated to match existing types
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    // BC53 FIX: Enforce http(s) protocol to prevent file://, ftp://, etc.
    url: z.string().url().refine(
      (u) => u.startsWith('https://') || u.startsWith('http://'),
      'URL must use http or https protocol'
    ).optional(),
    headers: z.record(z.string()).optional()
  }),
  capabilities: z.object({
    tools: z.boolean().default(true),
    resources: z.boolean().default(false),
    logging: z.boolean().default(true),
    prompts: z.boolean().optional()
  }),
  authentication: z.object({
    type: z.enum(['none', 'bearer', 'basic', 'api-key']),
    token: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    apiKey: z.string().optional()
  })
});

export function validateServerConfig(config: any) {
  try {
    MCPServerConfigSchema.parse(config);
    return { valid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        errors: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      };
    }
    return { valid: false, errors: [{ field: 'general', message: 'Invalid configuration' }] };
  }
}

export function validateTransportConfig(transport: any) {
  const { type } = transport;
  
  switch (type) {
    case 'stdio':
      if (!transport.command) {
        return { valid: false, error: 'Command is required for STDIO transport' };
      }
      break;
    case 'websocket':
    case 'sse':
      if (!transport.url) {
        return { valid: false, error: 'URL is required for WebSocket/SSE transport' };
      }
      break;
  }
  
  return { valid: true };
}
