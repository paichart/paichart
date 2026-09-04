import { z } from 'zod';
import { FormField } from './form-field-patterns';
import { safeRecord } from './zod-helpers';

/**
 * MCP Tools Validation Schemas
 * Validates query parameters for tools endpoints
 *
 * @created 2025-10-31 Phase 5 MCP Security
 */

/**
 * GET /api/mcp/tools query validation
 */
export const ListToolsQuerySchema = z.object({
  // Use FormField pattern to accept null from forms
  serverName: FormField.optionalString(),
  category: FormField.optionalString(),
  search: FormField.optionalString(),
  deprecated: FormField.optional(z.coerce.boolean()),
  limit: FormField.optional(z.coerce.number().int().min(1).max(200)),
}).strict();

export type ListToolsQuery = z.infer<typeof ListToolsQuerySchema>;

/**
 * Tool invocation validation (future use)
 */
export const InvokeToolSchema = z.object({
  toolName: z.string().min(1),
  serverName: z.string().min(1),
  // Use FormField pattern to accept null from forms
  parameters: FormField.optional(safeRecord()),
  // Use FormField pattern to accept null from forms
  timeout: FormField.optional(z.coerce.number().int().min(1000).max(300000)), // 1s to 5min
  // Database uses CUID format (@id @default(cuid())) + accepts null from forms
  povId: FormField.optionalCUID('POV ID'), // POV context
}).strict();

export type InvokeTool = z.infer<typeof InvokeToolSchema>;

// RegisterMCPToolSchema removed 2026-06-22 with the /api/mcp/tools/register route
// (legacy per-tool registration; MCP servers register via the registry tool).
