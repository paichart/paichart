/**
 * Service Quota Configuration
 *
 * Single source of truth for the per-user MCP service registration ceiling.
 *
 * Created 2026-09-22. Before this file the ceiling was TWO unlinked literals:
 * the enforced one (`const SERVICE_QUOTA = 10` inside the register handler) and
 * the REPORTED one (`user.serviceQuota || 10` in public-discovery-filter.js,
 * where `serviceQuota` is not a User column and the left side was therefore
 * always undefined — a dead expression yielding a hardcoded 10). An edit to
 * either was one step from the reported quota disagreeing with the enforced
 * one, and the reported one is what an autonomous agent PLANS against.
 *
 * Protocol 10: `serviceQuota` / `used` / `free` are FACTS an AI consumer acts
 * on (it decides how many services it can provision from them), so they have to
 * be the same number the register handler will actually enforce.
 */

/**
 * Maximum MCP services a single user may own.
 *
 * Flat and per-user — NOT per-tier, and NOT role-exempt: ADMIN and SUPER_ADMIN
 * are capped identically (there is no role branch at the enforcement site).
 */
const SERVICE_QUOTA = 10;

/**
 * The Prisma `where` clause that defines quota consumption.
 *
 * Deliberately carries NO status filter: an INACTIVE, ERROR or
 * PENDING_APPROVAL row consumes a slot exactly like a live one. Any caller
 * reporting quota MUST count with this clause, not with a status-filtered or
 * paginated service list, or the reported `used` will understate what the
 * register handler enforces.
 *
 * @param {string} userId - Owner to count services for
 * @returns {Object} Prisma where clause for mCPTool
 */
function ownedServicesWhere(userId) {
  return {
    configuration: {
      path: ['ownerId'],
      equals: userId
    }
  };
}

module.exports = {
  SERVICE_QUOTA,
  ownedServicesWhere
};
