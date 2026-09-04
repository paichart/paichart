/**
 * Service Delete Handler
 *
 * Handles MCP service deletion with ownership validation.
 * Supports GDPR Right to Erasure - service owners can permanently delete their services.
 *
 * Part of MCP Hub service lifecycle management.
 */

const { enhancedOperationError, notFoundError, missingServiceIdentifierError, serviceNotFoundByIdError } = require('./error-helpers');
const { stderr, createAdapter } = require('../../mcp-logger');
const log = createAdapter(stderr.mcpLogger.child({ component: 'hub-delete' }));
const { extractAuthContext, resolveService, validateOwnership, invalidateServiceCaches } = require('./hub-shared-middleware');

class ServiceDeleteHandler {
  /**
   * @param {Object} prisma - Prisma client instance
   * @param {Object} utilities - Hub utilities instance
   * @param {Object} parent - Parent handler for cache invalidation
   */
  constructor(prisma, utilities, parent = null) {
    this.prisma = prisma;
    this.utilities = utilities;
    this.parent = parent;
  }

  /**
   * Permanently delete an MCP service (GDPR Right to Erasure)
   *
   * @param {Object} args - Delete request arguments
   * @param {string} [args.serviceId] - Service ID (CUID) OR use service_name for magic lookup
   * @param {string} [args.service_name] - Service name for fuzzy lookup (alternative to serviceId)
   * @param {boolean} [args.confirm] - Confirmation flag (required for safety)
   * @param {Object} context - User authentication context (required)
   * @param {Object} context.user - Authenticated user
   * @param {string} context.user.id - User ID
   * @param {string} context.user.email - User email
   *
   * @returns {Promise<Object>} Delete result
   * @returns {boolean} returns.success - Whether deletion succeeded
   * @returns {string} returns.serviceId - Deleted service ID
   * @returns {string} returns.serviceName - Deleted service name
   * @returns {string} returns.message - Human-readable result
   * @returns {Object} returns.deletedData - Summary of what was deleted
   *
   * @throws {Error} If user not authenticated, service not found, or no ownership
   *
   * @example
   * const result = await handler.handle({
   *   service_name: 'my-service',
   *   confirm: true
   * }, { user: { id: 'user123', email: 'user@example.com' } });
   */
  async handle(args, context) {
    try {
      const { userId, userEmail } = extractAuthContext(context, 'Service deletion');

      // #218 Phase 3 sec-ops M2 (2026-05-23): rate limit on delete. The
      // confirm: true gate (BUG-REGISTRY safeguard) already prevents
      // accidental bulk-delete, but a deliberate attacker could still call
      // delete in a loop with confirm. Per sensitiveOperationLimiter shape:
      // 10/min — tight cap since delete is destructive.
      const { sensitiveOperationLimiter } = require('../../../../utils/rate-limiter');
      const deleteRateLimitKey = `registry.delete:${userId}`;
      const deleteAllowed = await sensitiveOperationLimiter.checkLimit(deleteRateLimitKey);
      if (!deleteAllowed) {
        throw new Error(
          '⏱️ Rate limit reached: too many registry delete calls. ' +
          'Limit: 10 per minute per user. Delete is rate-limited because ' +
          'it is destructive (GDPR right-to-erasure).'
        );
      }

      const { serviceId, service_name, confirm } = args;
      let finalServiceId = serviceId;

      // Service name lookup (fuzzy search via shared middleware)
      if (!finalServiceId && service_name) {
        const result = await resolveService({
          args: { service_name },
          prisma: this.prisma,
          options: {
            toolName: 'registry',
            statusFilter: ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'ERROR'],
            ownerFilter: userId,
            minScore: 100  // Require at least "contains" match — prevents catastrophic wrong-service deletion
          }
        });
        if (result.notFound) {
          // Add delete-specific context to NOT_FOUND response
          result.notFound.note = result.notFound.suggestions === 'No services found'
            ? 'You have no registered services to delete'
            : 'Only your own services can be deleted';
          // Override example to include confirm flag
          result.notFound.example = result.notFound.example.replace(')', ', confirm: true)');
          // Override nextSteps with delete-specific guidance
          result.notFound.nextSteps[0] = 'Use registry(action: "list") to see your registered services';
          return result.notFound;
        }
        finalServiceId = result.serviceId;
      }

      if (!finalServiceId) {
        throw missingServiceIdentifierError('delete');
      }

      // Find service and validate ownership
      const existingService = await this.prisma.mCPTool.findUnique({
        where: { id: finalServiceId },
        include: {
          interactions: { select: { id: true } },
          recommendations: { select: { id: true } }
        }
      });

      if (!existingService) {
        throw serviceNotFoundByIdError(finalServiceId, 'delete');
      }

      // Check ownership (only owner or admin can delete)
      await validateOwnership(userId, existingService, this.utilities);

      // Safety check: require confirmation for destructive operation.
      // Defense-in-depth — schema-side enforcement at tool-schemas.js
      // registry .superRefine() (Phase 3 D, 2026-05-18) is the canonical
      // gate; this handler-side check returns the friendly UX response
      // (confirmation prompt with dataToBeDeleted preview) when schema-side
      // would just reject with "confirm: true is required". Keep both.
      if (!confirm) {
        return {
          success: false,
          requiresConfirmation: true,
          serviceId: finalServiceId,
          serviceName: existingService.name,
          message: `Are you sure you want to permanently delete '${existingService.name}'? This action cannot be undone.`,
          warning: 'This will permanently delete all service data including health history and usage metrics.',
          dataToBeDeleted: {
            service: existingService.name,
            interactions: existingService.interactions?.length || 0,
            workflows: 'Not cascade-deleted (workflows may reference multiple services)',
            healthHistory: 'All health check records',
            metrics: 'All usage metrics'
          },
          howToConfirm: `registry(action: "delete", service_name: "${existingService.name}", confirm: true)`,
          _meta: {
            tool: 'registry',
            timestamp: new Date().toISOString(),
            sdkNative: true
          }
        };
      }

      log.info({ serviceName: existingService.name, serviceId: finalServiceId, userEmail }, 'Deleting service');

      // Capture data summary before deletion
      const deletedDataSummary = {
        serviceId: existingService.id,
        serviceName: existingService.name,
        description: existingService.description,
        category: existingService.configuration?.category,
        endpoint: existingService.configuration?.endpoint ? '[REDACTED]' : null,
        createdAt: existingService.createdAt,
        interactionsCount: existingService.interactions?.length || 0,
        recommendationsCount: existingService.recommendations?.length || 0
      };

      // Delete related records first (manual cascade - FK constraints are RESTRICT)
      // Log counts for audit trail before deletion
      const deletedInteractions = await this.prisma.mCPInteraction.deleteMany({
        where: { toolId: finalServiceId }
      });
      const deletedRecommendations = await this.prisma.mCPRecommendation.deleteMany({
        where: { toolId: finalServiceId }
      });

      log.info({ deletedInteractions: deletedInteractions.count, deletedRecommendations: deletedRecommendations.count }, 'Deleted related records');

      // Phase 3 sec-ops L2 (2026-05-23): emit SERVICE_DELETED audit event
      // BEFORE the actual delete. logPermissionsChange is fire-and-forget +
      // writes to the Activity table (immutable audit trail), distinct from
      // operational pino logs. Per GDPR right-to-erasure: we need an
      // attestation trail that survives operational log rotation.
      try {
        const { logPermissionsChange, HubAuditEvent } = require('./hub-audit-service');
        logPermissionsChange(finalServiceId, userId, {
          action: HubAuditEvent.SERVICE_DELETED,
          serviceName: existingService.name,
          ownerEmail: userEmail,
          deletedAt: new Date().toISOString(),
          deletedInteractions: deletedInteractions.count,
          deletedRecommendations: deletedRecommendations.count,
        });
      } catch (auditError) {
        // Audit emission is fire-and-forget — don't block the delete on
        // audit failure, but log loud so we notice if it stops working.
        log.error({ err: auditError, serviceId: finalServiceId }, 'SERVICE_DELETED audit emission failed');
      }

      // Delete the service
      await this.prisma.mCPTool.delete({
        where: { id: finalServiceId }
      });

      log.info({ serviceName: existingService.name, serviceId: finalServiceId, userEmail }, 'Service deleted');

      // Invalidate caches
      invalidateServiceCaches(this.parent, finalServiceId);

      return {
        success: true,
        serviceId: finalServiceId,
        serviceName: existingService.name,
        message: `Service '${existingService.name}' has been permanently deleted`,
        deletedData: {
          ...deletedDataSummary,
          // Actual deleted counts from cascade
          deletedInteractions: deletedInteractions.count,
          deletedRecommendations: deletedRecommendations.count
        },
        gdprCompliance: {
          rightToErasure: 'Exercised',
          dataDeleted: [
            'Service registration and configuration',
            'Endpoint information',
            'Health check history',
            'Usage metrics',
            `${deletedInteractions.count} service interactions`,
            `${deletedRecommendations.count} recommendations`
          ],
          dataRetained: [
            'Anonymized audit logs (90 days, then deleted)',
            'Security compliance logs (1 year, required by policy)',
            // Phase 3 sec-ops L1 (2026-05-23): explicit documentation of the
            // workflow-orphaning behavior. Workflows that reference the
            // deleted service by NAME (inside MCPWorkflow.steps + MCPWorkflowExecution
            // JSON columns) are NOT cascade-deleted because workflows may
            // reference multiple services. This is intentional but should be
            // surfaced so users can audit + clean up if needed.
            'Workflow definitions that reference this service by name (not cascade-deleted — workflows may reference multiple services). Use services(action: "workflow.list") to identify orphaned references.',
            'Workflow execution history rows that reference this service in their input JSON (preserved as immutable execution record).'
          ]
        },
        _meta: {
          tool: 'registry',
          timestamp: new Date().toISOString(),
          sdkNative: true,
          deletedBy: userEmail
        },
        nextSteps: [
          'Service has been permanently removed from the Hub',
          'Your endpoint is no longer accessible via pAIchart',
          'To re-register: registry(action: "register", name: "new-service", ...)',
          'View remaining services: registry(action: "list")'
        ]
      };
    } catch (error) {
      log.error({ err: error }, 'Service deletion failed');

      throw enhancedOperationError('Service deletion', error, {
        validParams: [
          'service_name: Name of your service to delete (required)',
          'serviceId: Service ID (alternative to service_name)',
          'confirm: true (required to confirm deletion)'
        ],
        examples: [
          'registry(action: "delete", service_name: "my-old-service", confirm: true)',
          'registry(action: "delete", serviceId: "cm123...", confirm: true)'
        ],
        tips: [
          'Use registry(action: "list") to see your registered services',
          'Only service owners can delete their services',
          'This action is permanent and cannot be undone',
          'GDPR: This exercises your Right to Erasure'
        ]
      });
    }
  }
}

module.exports = { ServiceDeleteHandler };
