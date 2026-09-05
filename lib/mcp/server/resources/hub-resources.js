/**
 * Hub Resource Provider for MCP Server
 * Exposes MCP Hub data via MCP resources
 *
 * Phase 2 Priority 3 - Hub Resources Implementation
 */

// Use global Prisma singleton
const { prisma } = require('../../../prisma');
const { stderr, createAdapter } = require('../mcp-logger');
const { sanitizeEndpointUrl } = require('../tools/hub/hub-shared-middleware');
const { PUBLIC_BASE_URL } = require('../../../auth/public-base-url');
// Live kid for mcp://hub/security — was a hardcoded 'paichart-2026-01' literal
// that went stale after the 2026-04-21 rotation (clients read the wrong kid).
const { getCurrentKid } = require('../../../auth/jwt-key-store');
const log = createAdapter(stderr.mcpLogger.child({ component: 'hub-resources' }));

/**
 * MCP Hub Resource Provider
 *
 * Provides access to hub services, analytics, and workflows via MCP resources
 *
 * @class HubResourceProvider
 * @description Exposes hub data through MCP resource protocol:
 *   - mcp://hub/services - All registered services
 *   - mcp://hub/services/active - Active services only
 *   - mcp://hub/services/category/{category} - Services by category
 *   - mcp://hub/analytics - Service performance metrics
 *   - mcp://hub/workflows - Service orchestration workflows
 */
class HubResourceProvider {
  /**
   * Creates Hub Resource Provider
   *
   * @param {Object} [injectedPrisma] - Optional Prisma instance (DI pattern)
   */
  constructor(injectedPrisma) {
    this.prisma = injectedPrisma || prisma;
  }

  /**
   * List all available hub resources
   *
   * @returns {Promise<Array<Object>>} Array of hub resource descriptors
   */
  async listResources() {
    return [
      {
        uri: 'mcp://hub/services',
        name: 'All MCP Services',
        description: 'Complete registry of all MCP services in the hub',
        mimeType: 'application/json'
      },
      {
        uri: 'mcp://hub/services/active',
        name: 'Active MCP Services',
        description: 'Currently active and operational MCP services',
        mimeType: 'application/json'
      },
      {
        uri: 'mcp://hub/services/category/ai-intelligence',
        name: 'AI Intelligence Services',
        description: 'AI and machine learning services',
        mimeType: 'application/json'
      },
      {
        uri: 'mcp://hub/services/category/data-services',
        name: 'Data Services',
        description: 'Data processing and management services',
        mimeType: 'application/json'
      },
      {
        uri: 'mcp://hub/services/category/automation',
        name: 'Automation Services',
        description: 'Workflow automation and integration services',
        mimeType: 'application/json'
      },
      {
        uri: 'mcp://hub/services/category/monitoring',
        name: 'Monitoring Services',
        description: 'Monitoring, logging, and observability services',
        mimeType: 'application/json'
      },
      {
        uri: 'mcp://hub/analytics',
        name: 'Hub Analytics',
        description: 'Service ecosystem performance and usage analytics',
        mimeType: 'application/json'
      },
      {
        uri: 'mcp://hub/workflows',
        name: 'Service Workflows',
        description: 'Multi-service orchestration workflow templates',
        mimeType: 'application/json'
      },
      {
        uri: 'mcp://hub/security',
        name: 'Security Compliance',
        description: 'MCP Security Best Practices compliance status, architecture overview, and trust signals',
        mimeType: 'application/json'
      }
    ];
  }

  /**
   * Read a specific hub resource
   *
   * @param {string} uri - Resource URI (mcp://hub/...)
   * @returns {Promise<Object>} Resource content
   */
  async readResource(uri) {
    // Phase B: Parse URI to extract path and query parameters for pagination
    const url = new URL(uri, 'mcp://hub');
    const path = url.pathname.replace('/hub/', '').replace('/', '');
    const params = Object.fromEntries(url.searchParams);

    // Extract pagination options
    const options = {
      limit: params.limit ? parseInt(params.limit) : 50,
      cursor: params.cursor || null
    };

    try {
      // Route to appropriate handler based on URI path (with pagination options)
      if (path === 'services') {
        return await this.getAllServices(options);
      } else if (path === 'services/active') {
        return await this.getActiveServices(options);
      } else if (path.startsWith('services/category/')) {
        const category = path.replace('services/category/', '');
        return await this.getServicesByCategory(category, options);
      } else if (path === 'analytics') {
        return await this.getAnalytics();
      } else if (path === 'workflows') {
        return await this.getWorkflows();
      } else if (path === 'security') {
        return this.getSecurityCompliance();
      } else {
        throw new Error(`Unknown hub resource: ${uri}`);
      }
    } catch (error) {
      const isNotFound = error.message?.includes('Unknown hub resource');
      if (isNotFound) {
        log.warn('Hub resource not found', { uri });
      } else {
        log.error('Failed to read resource', { uri, err: error });
      }
      throw error;
    }
  }

  /**
   * Get all registered services (with pagination support)
   */
  async getAllServices(options = {}) {
    const limit = options.limit || 50;
    const cursor = options.cursor;

    // Phase B: Cursor-based pagination (standard pattern)
    const services = await this.prisma.mCPTool.findMany({
      take: limit + 1,  // Fetch one extra to check hasMore
      cursor: cursor ? { id: cursor } : undefined,
      select: {
        id: true,
        name: true,
        description: true,
        version: true,
        capabilities: true,
        status: true,
        responseTime: true,
        successRate: true,
        errorCount: true,
        lastHeartbeat: true,
        createdAt: true,
        updatedAt: true,
        configuration: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // Standard pagination logic
    const hasMore = services.length > limit;
    const results = hasMore ? services.slice(0, limit) : services;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    return {
      contents: [{
        uri: 'mcp://hub/services',
        mimeType: 'application/json',
        text: JSON.stringify({
          // 2026-07-28: `total` here is the PAGE count, not a collection size — this
          // endpoint is CURSOR-paginated (take: limit+1; hasMore derived from the extra
          // row), so `hasMore`/`nextCursor` are authoritative and independent of it.
          // Swept as part of the pagination-basis review: no defect here, unlike the
          // OFFSET-paginated discovery response, which computed hasMore/totalPages FROM
          // a page-length variable and so could never reach page 2. `returned` is emitted
          // alongside for the same reason as the discovery + registry-list responses: a
          // lone `total` reads as a collection size to a reasoner.
          total: results.length,
          returned: results.length,
          services: results.map(s => ({
            id: s.id,
            name: s.name,
            description: s.description,
            version: s.version,
            capabilities: s.capabilities,
            status: s.status,
            endpoint: sanitizeEndpointUrl(s.configuration?.endpoint),
            performance: {
              responseTime: s.responseTime,
              successRate: s.successRate,
              errorCount: s.errorCount
            },
            lastHeartbeat: s.lastHeartbeat,
            updatedAt: s.updatedAt
          })),
          pagination: {
            limit,
            hasMore,
            nextCursor,
            note: hasMore ? `Fetch more: mcp://hub/services?cursor=${nextCursor}` : 'No more services'
          }
        }, null, 2)
      }]
    };
  }

  /**
   * Get active services only (with pagination support)
   */
  async getActiveServices(options = {}) {
    const limit = options.limit || 50;
    const cursor = options.cursor;

    const services = await this.prisma.mCPTool.findMany({
      where: { status: 'ACTIVE' },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      select: {
        id: true,
        name: true,
        description: true,
        capabilities: true,
        responseTime: true,
        successRate: true,
        configuration: true
      },
      orderBy: { name: 'asc' }
    });

    const hasMore = services.length > limit;
    const results = hasMore ? services.slice(0, limit) : services;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    return {
      contents: [{
        uri: 'mcp://hub/services/active',
        mimeType: 'application/json',
        text: JSON.stringify({
          // 2026-07-28: `total` here is the PAGE count, not a collection size — this
          // endpoint is CURSOR-paginated (take: limit+1; hasMore derived from the extra
          // row), so `hasMore`/`nextCursor` are authoritative and independent of it.
          // Swept as part of the pagination-basis review: no defect here, unlike the
          // OFFSET-paginated discovery response, which computed hasMore/totalPages FROM
          // a page-length variable and so could never reach page 2. `returned` is emitted
          // alongside for the same reason as the discovery + registry-list responses: a
          // lone `total` reads as a collection size to a reasoner.
          total: results.length,
          returned: results.length,
          services: results.map(s => ({
            id: s.id,
            name: s.name,
            description: s.description,
            capabilities: s.capabilities,
            endpoint: sanitizeEndpointUrl(s.configuration?.endpoint),
            performance: {
              responseTime: s.responseTime,
              successRate: s.successRate
            }
          })),
          pagination: {
            limit,
            hasMore,
            nextCursor,
            note: hasMore ? `Fetch more: mcp://hub/services/active?cursor=${nextCursor}` : 'No more services'
          }
        }, null, 2)
      }]
    };
  }

  /**
   * Get services by category (with pagination support)
   */
  async getServicesByCategory(category, options = {}) {
    const limit = options.limit || 50;
    const cursor = options.cursor;

    const services = await this.prisma.mCPTool.findMany({
      where: {
        configuration: {
          path: ['category'],
          equals: category
        }
      },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      select: {
        id: true,
        name: true,
        description: true,
        capabilities: true,
        status: true,
        configuration: true
      },
      orderBy: { name: 'asc' }
    });

    const hasMore = services.length > limit;
    const results = hasMore ? services.slice(0, limit) : services;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    return {
      contents: [{
        uri: `mcp://hub/services/category/${category}`,
        mimeType: 'application/json',
        text: JSON.stringify({
          category,
          // 2026-07-28: `total` here is the PAGE count, not a collection size — this
          // endpoint is CURSOR-paginated (take: limit+1; hasMore derived from the extra
          // row), so `hasMore`/`nextCursor` are authoritative and independent of it.
          // Swept as part of the pagination-basis review: no defect here, unlike the
          // OFFSET-paginated discovery response, which computed hasMore/totalPages FROM
          // a page-length variable and so could never reach page 2. `returned` is emitted
          // alongside for the same reason as the discovery + registry-list responses: a
          // lone `total` reads as a collection size to a reasoner.
          total: results.length,
          returned: results.length,
          services: results.map(s => ({
            id: s.id,
            name: s.name,
            description: s.description,
            capabilities: s.capabilities,
            status: s.status,
            endpoint: sanitizeEndpointUrl(s.configuration?.endpoint)
          })),
          pagination: {
            limit,
            hasMore,
            nextCursor,
            note: hasMore ? `Fetch more: mcp://hub/services/category/${category}?cursor=${nextCursor}` : 'No more services'
          }
        }, null, 2)
      }]
    };
  }

  /**
   * Get hub analytics
   */
  async getAnalytics() {
    const totalServices = await this.prisma.mCPTool.count();
    const activeServices = await this.prisma.mCPTool.count({
      where: { status: 'ACTIVE' }
    });

    const servicesWithMetrics = await this.prisma.mCPTool.findMany({
      where: {
        responseTime: { not: null }
      },
      select: {
        responseTime: true,
        successRate: true,
        errorCount: true
      },
      take: 200
    });

    const avgResponseTime = servicesWithMetrics.length > 0
      ? servicesWithMetrics.reduce((sum, s) => sum + (s.responseTime || 0), 0) / servicesWithMetrics.length
      : 0;

    const avgSuccessRate = servicesWithMetrics.length > 0
      ? servicesWithMetrics.reduce((sum, s) => sum + (s.successRate || 0), 0) / servicesWithMetrics.length
      : 0;

    return {
      contents: [{
        uri: 'mcp://hub/analytics',
        mimeType: 'application/json',
        text: JSON.stringify({
          ecosystem: {
            totalServices,
            activeServices,
            inactiveServices: totalServices - activeServices
          },
          performance: {
            averageResponseTime: Math.round(avgResponseTime),
            averageSuccessRate: Math.round(avgSuccessRate * 100) / 100,
            servicesWithMetrics: servicesWithMetrics.length
          },
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
  }

  /**
   * Get workflow templates
   */
  async getWorkflows() {
    // Future: Return actual workflow templates
    // For now, return placeholder structure
    return {
      contents: [{
        uri: 'mcp://hub/workflows',
        mimeType: 'application/json',
        text: JSON.stringify({
          workflows: [
            {
              name: 'sequential-service-chain',
              description: 'Execute services in sequence, passing results forward',
              services: [],
              status: 'template'
            },
            {
              name: 'parallel-service-execution',
              description: 'Execute multiple services in parallel and aggregate results',
              services: [],
              status: 'template'
            },
            {
              name: 'conditional-service-routing',
              description: 'Route to different services based on conditions',
              services: [],
              status: 'template'
            }
          ],
          note: 'Workflow execution templates - actual workflows can be created via orchestrate_workflow prompt',
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
  }
  /**
   * Get security compliance status
   * Returns MCP Security Best Practices compliance data
   * No database queries — static security posture information
   */
  getSecurityCompliance() {
    return {
      contents: [{
        uri: 'mcp://hub/security',
        mimeType: 'application/json',
        text: JSON.stringify({
          platform: 'pAIchart MCP Hub',
          version: '1.0.0',
          complianceDate: '2026-03-28',
          overallCompliance: '92%',
          specialistReviews: 20,
          reference: 'https://modelcontextprotocol.io/specification/draft/basic/security_best_practices',

          requirements: {
            confusedDeputy: {
              status: 'COMPLIANT',
              description: 'OAuth proxy pattern with per-client detection, redirect_uri allowlist, PKCE mandatory, cryptographic state',
              implementation: [
                'OAuth proxy pattern — server-owned /oauth/callback, pac_ auth codes',
                'isAllowedRedirectUri() validates at authorize, registration, and Microsoft handler',
                'PKCE (code_challenge) mandatory per OAuth 2.1 — requests without it rejected',
                'Server-generated state: crypto.randomBytes(32), single-use, 15-min TTL',
                'CLIENT_PROVIDER_MAP detects client type for provider routing (ChatGPT → Microsoft)'
              ]
            },
            tokenPassthrough: {
              status: 'COMPLIANT',
              description: 'First-party RS256 JWT minting, provider tokens never reach clients or external services',
              implementation: [
                'First-party RS256 JWT minting (Pattern #29) — provider tokens exchanged server-side only',
                'Ambient provider token protection — raw GitHub/Microsoft tokens rejected at /mcp endpoint',
                `JWKS public key endpoint: ${PUBLIC_BASE_URL}/api/auth/jwks (24h cache, RS256)`,
                'Token audience separation: /api (web) vs /mcp (MCP clients) per RFC 8707',
                'Unified key architecture with 90-day rotation schedule (current kid published at the JWKS endpoint)'
              ]
            },
            ssrf: {
              status: 'COMPLIANT',
              description: 'HTTPS enforcement, SSRF/trust decoupling, registered endpoint validation',
              implementation: [
                'HTTPS enforced for all non-localhost redirect URIs',
                'SSRF bypass decoupled from trust level determination (5-specialist reviewed)',
                'Docker services on localhost with registered endpoints validated at registration',
                'Service evaluation engine with automated risk scoring at registration'
              ]
            },
            sessionHijacking: {
              status: 'COMPLIANT',
              description: 'Bearer auth on every request, session-user identity binding, mismatch rejection',
              implementation: [
                'Every POST to /mcp verified via Bearer token (RS256 JWT) in auth middleware',
                'Fresh req.user preferred over stale session context on every request',
                'Session-user identity binding: userId stored at session creation, verified on each POST',
                'Identity mismatch returns 403 with security alert logging',
                'Session IDs: UUID (cryptographically random), 30-min TTL, bounded store (10,000 max)'
              ]
            },
            localServerCompromise: {
              status: 'NOT_APPLICABLE',
              description: 'pAIchart is a hosted platform, not a local MCP server',
              implementation: [
                'Users connect via OAuth to paichart.app/mcp — no local binary execution',
                'Docker MCP services containerized with resource limits',
                '6-tier trust level system (INTERNAL, TRUSTED, OWNER, TEAM_MEMBER, SCOPED, ANONYMOUS)'
              ]
            },
            scopeMinimization: {
              status: 'MITIGATED_BY_RBAC',
              description: 'Handler-level RBAC provides equivalent authorization; scope enforcement deferred pending third-party requirements',
              implementation: [
                'RBAC: role_permissions table + enforceToolSecurity() checks role on every tool call',
                'withPOVAccess middleware for resource-level isolation',
                'Tool annotations (readOnlyHint/destructiveHint) on all tools — ready for scope mapping',
                'Scopes embedded in every JWT — infrastructure ready, enforcement deferred',
                'Reason for deferral: third parties require proprietary scopes (Snowflake: session:role-any) — premature enforcement locks into wrong vocabulary'
              ]
            }
          },

          authentication: {
            providers: ['GitHub', 'Microsoft', 'Google'],
            tokenType: 'RS256 JWT (first-party minted)',
            keyId: getCurrentKid(),
            jwksEndpoint: `${PUBLIC_BASE_URL}/api/auth/jwks`,
            tokenTTL: '15 minutes',
            refreshTokenTTL: '7 days',
            keyRotation: '90-day schedule',
            securityScore: '95/100'
          },

          trustLevels: [
            { level: 'INTERNAL', getsToken: true, description: 'Platform services (paichart-*)' },
            { level: 'TRUSTED', getsToken: true, description: 'Local Docker services' },
            { level: 'OWNER', getsToken: true, description: 'User owns the service' },
            { level: 'TEAM_MEMBER', getsToken: true, description: 'Service owner on same POV team' },
            { level: 'SCOPED', getsToken: false, description: 'Public service with POV context' },
            { level: 'ANONYMOUS', getsToken: false, description: 'Public service, no context' }
          ],

          links: {
            jwks: `${PUBLIC_BASE_URL}/api/auth/jwks`,
            llmsTxt: `${PUBLIC_BASE_URL}/llms.txt`,
            mcpServerCard: `${PUBLIC_BASE_URL}/.well-known/mcp.json`,
            agentCard: `${PUBLIC_BASE_URL}/.well-known/agent-card.json`,
            publicDiscovery: `${PUBLIC_BASE_URL}/api/mcp/discover`,
            anthropicSpec: 'https://modelcontextprotocol.io/specification/draft/basic/security_best_practices'
          }
        }, null, 2)
      }]
    };
  }
}

module.exports = { HubResourceProvider };
