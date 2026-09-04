import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse, UserRole } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { mcpLogger } from '@/lib/logger';
// 2026-05-17 Finding #1: sanitize raw configuration before returning. See
// cline_docs/reviews/post-hardening-audit-2026-05-17/
// BUG-REPORT-mcp-credential-exposure-across-5-read-paths-2026-05-17.md
const { sanitizeConfiguration } = require('@/lib/mcp/server/tools/public-discovery-filter');

type ApiHandler<T = unknown> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// Sanitize endpoint URLs by stripping sensitive query parameters
function sanitizeEndpointUrl(url: string | undefined | null): string | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    const sensitiveParams = ['apikey', 'api_key', 'key', 'token', 'secret', 'password', 'auth', 'access_token'];
    for (const param of sensitiveParams) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, '***');
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

// Query parameter validation
const ServicesQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).optional().default('ACTIVE'),
  category: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(50)
});

/**
 * GET /api/mcp/services - List registered MCP Hub services
 *
 * Returns services from MCPTool table for workflow recommendations
 * and service discovery in the workflow management UI.
 *
 * Security: User-authenticated (READ operations only)
 */
const getMCPServicesHandler: ApiHandler = async (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => {
  if (!user) {
    return {
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    };
  }

  try {
    // Parse and validate query parameters
    const { searchParams } = new URL(req.url);
    const rawQuery = {
      status: searchParams.get('status') || undefined,
      category: searchParams.get('category') || undefined,
      limit: searchParams.get('limit') || undefined
    };

    const validation = ServicesQuerySchema.safeParse(rawQuery);
    if (!validation.success) {
      return {
        error: {
          message: 'Invalid query parameters',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        },
      };
    }

    const { status, category, limit } = validation.data;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (status !== 'ALL') {
      where.status = status;
    }

    if (category) {
      where.configuration = {
        path: ['category'],
        equals: category
      };
    }

    // Query MCP Hub services from database
    const services = await prisma.mCPTool.findMany({
      where,
      take: limit,
      orderBy: [
        { status: 'asc' },
        { name: 'asc' }
      ],
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        version: true,
        capabilities: true,
        configuration: true,  // Contains category, endpoint
        // Health metrics
        successRate: true,
        responseTime: true,
        errorCount: true,
        lastHeartbeat: true,
        // Metadata
        createdAt: true,
        updatedAt: true
      }
    });

    // Transform services to expose category/endpoint/owner from configuration
    const transformedServices = services.map(service => {
      const config = service.configuration as {
        category?: string;
        endpoint?: string;
        ownerId?: string;
        ownerEmail?: string;
      } | null;

      return {
        ...service,
        // 2026-05-17 Finding #1: explicitly override the spread-included
        // `configuration` with a sanitized copy. Removes API keys / tokens /
        // secrets recursively and redacts credentialed endpoint URLs. The prior
        // raw spread leaked the full configuration including nested
        // evaluationResult.serviceData.endpoint to any admin hitting this
        // endpoint.
        configuration: sanitizeConfiguration(service.configuration),
        category: config?.category || null,
        endpoint: sanitizeEndpointUrl(config?.endpoint) || null,
        ownerEmail: config?.ownerEmail || null,  // Add owner email for display
        capabilities: service.capabilities as {
          tools?: Array<{
            name: string;
            description?: string;
            inputSchema?: Record<string, unknown>;
          } | string>;
          prompts?: string[];
          resources?: string[];
        } | null,
        healthMetrics: {
          successRate: service.successRate,
          responseTime: service.responseTime,
          errorCount: service.errorCount,
          lastCheck: service.lastHeartbeat
        }
      };
    });

    mcpLogger.info({ serviceCount: services.length, userId: user.userId }, 'Returning MCP services');

    return {
      data: {
        services: transformedServices,
        total: services.length,
        filters: { status, category, limit }
      }
    };
  } catch (error) {
    mcpLogger.error({ err: error }, 'Failed to fetch MCP services');
    return {
      error: {
        message: 'Failed to fetch MCP services',
        code: 'SERVICES_FETCH_FAILED',
        details: 'See server logs for details'
      },
    };
  }
};

export const GET = createHandler(getMCPServicesHandler, {
  requireAuth: true,
  allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  rateLimit: 'admin' as const
});
