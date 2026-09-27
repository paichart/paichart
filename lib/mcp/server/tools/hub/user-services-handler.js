/**
 * User Services Handler
 *
 * Lists services owned by the authenticated user, with identity info
 * and optional hub-wide statistics.
 *
 * Extracted from hub-tools-handler.js (Phase 4 Task 1 Days 3-5)
 * @refactored 2026-02-12 (merged my_status identity/statistics into this tool)
 */

const { extractAuthContext } = require('./hub-shared-middleware');
const { SERVICE_QUOTA, ownedServicesWhere } = require('../../config/service-quota');
const { stderr, createAdapter } = require('../../mcp-logger');
const log = createAdapter(stderr.mcpLogger.child({ component: 'hub-user-services' }));

class UserServicesHandler {
  /**
   * @param {Object} prisma - Prisma client instance
   */
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * List services owned by the authenticated user
   *
   * @param {Object} args - Request arguments
   * @param {string} [args.status='ALL'] - Filter by status (ACTIVE, INACTIVE, ALL)
   * @param {boolean} [args.includeMetrics=false] - Include aggregate metrics
   * @param {boolean} [args.includeStatistics=false] - Include hub-wide statistics
   * @param {Object} context - User authentication context
   * @returns {Promise<Object>} User identity, services, and optional stats
   */
  async handle(args, context) {
    try {
      const { userId, userEmail, role } = extractAuthContext(context, 'List my services');

      const where = ownedServicesWhere(userId);

      if (args.status !== 'ALL') {
        where.status = args.status;
      }

      const services = await this.prisma.mCPTool.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          version: true,
          status: true,
          responseTime: true,
          successRate: true,
          lastHeartbeat: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: 100
      });

      const response = {
        user: {
          email: userEmail,
          role,
          // 2026-05-26: derive from role instead of hardcoding 'full_access' — the
          // hardcoded value was a misleading claim for DEMO/standard users.
          access_level: (role === 'ADMIN' || role === 'SUPER_ADMIN') ? 'full_access' : (role === 'DEMO_USER' ? 'demo' : 'standard')
        },
        services,
        // 2026-07-28: `returned` emitted alongside `total`, matching
        // prompt-list-handler.js and createAuthenticatedDiscoveryResponse. Both are the
        // RETURNED count here — there is no pagination block to contradict them today,
        // which is exactly why it is worth naming now: if one is ever added, `total`
        // silently becomes ambiguous against `pagination.total` (the registry-wide
        // count). That is the confusion fixed in the discovery response on the same day.
        total: services.length,
        returned: services.length
      };

      // 2026-09-22: quota block. Until now the ONLY place a caller could learn
      // its own ceiling was services(action:'discover').capabilities — i.e. an
      // agent had to page a listing of OTHER users' services to find out how
      // many more of its OWN it could register. An autonomous caller planning a
      // multi-service provision (harness Phase 0 self-provisioning) needs this
      // from the tool it already calls to see what it owns.
      //
      // This deliberately does NOT derive from `services` above: that array is
      // status-filtered by args.status and capped at take:100, whereas quota
      // consumption is every owned row regardless of status. Reusing it would
      // report a smaller `used` than the register handler enforces.
      //
      // `active` is split out because the non-ACTIVE row is the trap case: a
      // registration failing the auto-approve policy returns success:true with
      // status INACTIVE / approvalStatus PENDING_APPROVAL, so it CONSUMES A
      // SLOT WHILE BEING UNCALLABLE. Reporting only `used` leaves that silent;
      // `used: 8, active: 7` is legible. (The approval behaviour itself is
      // policy and is deliberately unchanged.)
      try {
        const byStatus = await this.prisma.mCPTool.groupBy({
          by: ['status'],
          where: ownedServicesWhere(userId),
          _count: { _all: true }
        });

        const used = byStatus.reduce((sum, row) => sum + row._count._all, 0);
        const active = byStatus.find(row => row.status === 'ACTIVE')?._count._all || 0;
        const nonActive = used - active;

        response.quota = {
          limit: SERVICE_QUOTA,
          used,
          free: Math.max(0, SERVICE_QUOTA - used),
          active,
          nonActive,
          byStatus: Object.fromEntries(byStatus.map(row => [row.status, row._count._all]))
        };

        if (nonActive > 0) {
          response.quota.note =
            `${nonActive} of your ${used} services are not ACTIVE. Non-ACTIVE rows ` +
            `(INACTIVE / PENDING_APPROVAL / ERROR) still consume quota and cannot be called — ` +
            `registry(action: 'delete', service_name: '...', confirm: true) frees the slot.`;
        }
      } catch (quotaError) {
        // Omit rather than report a wrong ceiling: `free` is a FACT an agent
        // plans provisioning against (Protocol 10). Absent is recoverable —
        // the caller falls back to services(action:'discover').capabilities.
        log.error(
          { err: quotaError, userId },
          'Quota count failed — omitting quota block from registry.list'
        );
      }

      if (args.includeMetrics) {
        response.metrics = {
          totalServices: services.length,
          activeServices: services.filter(s => s.status === 'ACTIVE').length,
          avgSuccessRate: services.length > 0
            ? services.reduce((sum, s) => sum + (s.successRate || 0), 0) / services.length
            : 0,
          avgResponseTime: services.length > 0
            ? services.reduce((sum, s) => sum + (s.responseTime || 0), 0) / services.length
            : 0
        };
      }

      if (args.includeStatistics) {
        try {
          const [totalServices, activeServices, categories] = await Promise.all([
            this.prisma.mCPTool.count(),
            this.prisma.mCPTool.count({ where: { status: 'ACTIVE' } }),
            this.prisma.mCPTool.findMany({
              where: { status: 'ACTIVE' },
              select: { configuration: true },
              distinct: ['configuration'],
              take: 100
            })
          ]);

          const uniqueCategories = [...new Set(
            categories.map(s => s.configuration?.category).filter(Boolean)
          )];

          response.hub_statistics = {
            total_services: totalServices,
            active_services: activeServices,
            active_categories: uniqueCategories,
            hub_status: "operational"
          };
        } catch (error) {
          log.warn({ err: error }, 'Failed to get hub statistics');
          response.hub_statistics = { hub_status: "operational" };
        }
      }

      response.nextSteps = services.length > 0
        ? [
            `Managing ${services.length} service${services.length === 1 ? '' : 's'}`,
            `Check health: services(action: 'health', service_name: '${services[0].name}')`,
            "Update config: registry(action: 'update', service_name: 'your-service', ...)"
          ]
        : [
            "You haven't registered any services yet",
            "Register your first service: registry(action: 'register', name: 'my-service', ...)",
            "Discover existing services: services(action: \"discover\")"
          ];

      // BUG-REGISTRY-001 fix (2026-05-22): previously also copied response.nextSteps
      // into _meta.nextSteps — identical content in two slots. The canonical
      // user-facing location is response.nextSteps (already set at L118). Drop
      // the _meta copy. _meta keeps the protocol metadata (tool, timestamp,
      // sdkNative) only.
      response._meta = {
        tool: 'registry',
        timestamp: new Date().toISOString(),
        sdkNative: true
      };

      return response;
    } catch (error) {
      log.error({ err: error }, 'List my services failed');
      return {
        content: [{ type: "text", text: `❌ List my services failed: ${error.message}` }],
        isError: true,
        _meta: {
          tool: 'registry',
          timestamp: new Date().toISOString(),
          sdkNative: true,
          nextSteps: [
            'Try: registry(action: "list") without filters',
            'Check: Authentication is valid (OAuth, API Key, or JWT)',
            'Alternative: services(action: "discover") to browse all hub services'
          ]
        }
      };
    }
  }
}

module.exports = { UserServicesHandler };
