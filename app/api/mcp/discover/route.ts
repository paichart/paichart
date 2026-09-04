import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createRateLimiter } from '@/lib/middleware/rate-limit';
import { mcpLogger } from '@/lib/logger';

/**
 * GET /api/mcp/discover - Public MCP Hub service discovery endpoint
 *
 * Returns service catalog metadata WITHOUT authentication.
 * Designed for AI agents, directories, and automated discovery.
 *
 * Security:
 * - No authentication required (public metadata only)
 * - Rate limited: 60 requests/minute per IP
 * - No endpoints, credentials, or internal config exposed
 * - Only service names, descriptions, capabilities, and tool names
 *
 * Standards:
 * - Complements /.well-known/mcp.json (MCP server card)
 * - Complements /.well-known/agent-card.json (A2A protocol)
 * - Complements /llms.txt (LLM-readable description)
 */

const discoverLimiter = createRateLimiter({
  limit: 60,
  windowMs: 60 * 1000,
  message: 'Too many discovery requests. Please try again later.',
});

export async function GET(request: NextRequest) {
  const rateLimitResponse = discoverLimiter(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const capability = searchParams.get('capability') || undefined;

    const where: Record<string, unknown> = {
      status: 'ACTIVE',
    };

    if (category) {
      where.configuration = {
        path: ['category'],
        equals: category,
      };
    }

    const services = await prisma.mCPTool.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        version: true,
        capabilities: true,
        configuration: true,
        status: true,
        createdAt: true,
      },
    });

    // Transform to public-safe format: no endpoints, no owners, no config
    const publicServices = services
      .map((service) => {
        const config = service.configuration as { category?: string } | null;
        const caps = service.capabilities as {
          tools?: Array<{ name: string; description?: string } | string>;
          categories?: string[];
          transport?: string;
        } | null;

        // Extract tool names and descriptions (no schemas)
        const tools = (caps?.tools || []).map((t) =>
          typeof t === 'string' ? { name: t } : { name: t.name, description: t.description }
        );

        const categories = caps?.categories || [];
        if (config?.category && !categories.includes(config.category)) {
          categories.push(config.category);
        }

        return {
          name: service.name,
          description: service.description,
          version: service.version || '1.0.0',
          categories,
          tools,
          toolCount: tools.length,
          status: service.status,
        };
      })
      .filter((service) => {
        // Filter by capability keyword if provided
        if (!capability) return true;
        const lower = capability.toLowerCase();
        return (
          service.categories.some((c) => c.toLowerCase().includes(lower)) ||
          service.description?.toLowerCase().includes(lower) ||
          service.tools.some(
            (t) =>
              t.name.toLowerCase().includes(lower) ||
              t.description?.toLowerCase().includes(lower)
          )
        );
      });

    const totalTools = publicServices.reduce((sum, s) => sum + s.toolCount, 0);

    mcpLogger.debug(
      { serviceCount: publicServices.length, category, capability },
      'Public discovery request'
    );

    return NextResponse.json(
      {
        hub: {
          name: 'pAIchart MCP Hub',
          version: '1.0.0',
          description:
            'AI-native service orchestration with per-user authentication, capability-based discovery, and multi-service workflow chaining',
          url: 'https://paichart.app',
        },
        services: publicServices,
        totalServices: publicServices.length,
        totalTools,
        authentication: {
          providers: ['github', 'google', 'microsoft'],
          jwksEndpoint: 'https://paichart.app/api/auth/jwks',
          protocol: 'OAuth 2.0 / Bearer JWT (RS256)',
        },
        capabilities: {
          serviceDiscovery: true,
          workflowOrchestration: true,
          perUserAuth: true,
          externalOAuth: ['Snowflake', 'Databricks', 'Azure SQL'],
          trustLevels: ['INTERNAL', 'TRUSTED', 'OWNER', 'TEAM_MEMBER', 'SCOPED', 'ANONYMOUS'],
        },
        access: {
          mcp: 'https://paichart.app/mcp',
          llmsTxt: 'https://paichart.app/llms.txt',
          mcpServerCard: 'https://paichart.app/.well-known/mcp.json',
          agentCard: 'https://paichart.app/.well-known/agent-card.json',
        },
        _filters: {
          category: category || null,
          capability: capability || null,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=300', // Cache 5 minutes
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    mcpLogger.error({ err: error }, 'Public discovery endpoint error');
    return NextResponse.json(
      { error: 'Service discovery temporarily unavailable' },
      { status: 500 }
    );
  }
}
