import { z } from 'zod';
import { FormField } from './form-field-patterns';
import { stripDangerousKeys } from '@/lib/utils/sanitize-keys';

/**
 * MCP Resources Validation Schemas
 * Validates query parameters for resource endpoints
 *
 * @created 2025-10-31 Phase 5 MCP Security
 * @updated 2025-10-31 v4 - Added povContext field for caching optimization
 */

// Resource types enum
export const MCPResourceTypeSchema = z.enum([
  'file',
  'database',
  'api',
  'memory',
  'stream',
  'configuration',
  'log',
  'metric',
  'other'
]);

// Sort options
export const MCPResourceSortBySchema = z.enum([
  'name',
  'lastModified',
  'lastAccessed',
  'size',
  'accessCount'
]);

export const MCPResourceSortOrderSchema = z.enum(['asc', 'desc']);

/**
 * POV Context schema for caching optimization
 * Cached during discovery to reduce validation overhead from 50-100ms to 5ms
 */
export const POVContextSchema = FormField.optional(z.object({
  // Database uses CUID format (@id @default(cuid()))
  id: z.string().cuid(),
  ownerId: z.string(),
  // Use FormField pattern to accept null from forms
  teamMemberIds: FormField.optional(z.array(z.string())),
  // Use FormField pattern to accept null from forms
  isDemo: FormField.optional(z.boolean()),
  // Use FormField pattern to accept null from forms
  tenantId: FormField.optionalString(),
}));

export type POVContext = z.infer<typeof POVContextSchema>;

/**
 * GET /api/mcp/resources query validation
 */
export const ListResourcesQuerySchema = z.object({
  // Use FormField pattern to accept null from forms
  serverName: FormField.optionalString(),
  // Use FormField pattern to accept null from forms
  type: FormField.optional(MCPResourceTypeSchema),
  // Use FormField pattern to accept null from forms
  search: FormField.optionalString(),
  // Use FormField pattern to accept null from forms
  limit: FormField.optional(z.coerce.number().int().min(1).max(200)),
  // Use FormField pattern to accept null from forms
  offset: FormField.optional(z.coerce.number().int().min(0)),
  // Use FormField pattern to accept null from forms
  sortBy: FormField.optional(MCPResourceSortBySchema),
  // Use FormField pattern to accept null from forms
  sortOrder: FormField.optional(MCPResourceSortOrderSchema),
  // Database uses CUID format (@id @default(cuid())) + accepts null from forms
  povId: FormField.optionalCUID('POV ID'), // POV filter for scoping
  // Use FormField pattern to accept null from forms
  tags: FormField.optionalString(), // Comma-separated tags
}).strict();

export type ListResourcesQuery = z.infer<typeof ListResourcesQuerySchema>;

/**
 * GET /api/mcp/resources/[uri] query validation
 */
export const ReadResourceQuerySchema = z.object({
  // Use FormField pattern to accept null from forms
  serverName: FormField.optionalString(),
  // Database uses CUID format (@id @default(cuid())) + accepts null from forms
  povId: FormField.optionalCUID('POV ID'), // POV context for access control
  // Use FormField pattern to accept null from forms
  includeContent: FormField.optional(z.coerce.boolean()),
}).strict();

export type ReadResourceQuery = z.infer<typeof ReadResourceQuerySchema>;

/**
 * Resource response schema with POV context
 * v4: Added povContext for caching optimization
 */
export const ResourceResponseSchema = z.object({
  uri: z.string(),
  name: z.string(),
  // Use FormField pattern to accept null from forms
  description: FormField.optionalString(),
  // Use FormField pattern to accept null from forms
  mimeType: FormField.optionalString(),
  // Use FormField pattern to accept null from forms
  metadata: FormField.optional(z.object({
    // Database uses CUID format (@id @default(cuid())) + accepts null from forms
    povId: FormField.optionalCUID('POV ID'),
    povContext: POVContextSchema, // ⭐ NEW in v4
  }).passthrough().transform(stripDangerousKeys)),
  // Use FormField pattern to accept null from forms
  content: FormField.optional(z.any()),
});

export type ResourceResponse = z.infer<typeof ResourceResponseSchema>;
