/**
 * resolve-service-ref.js — the ONE way a gateway resolves a `targetService` reference to a registry row
 * (PLATFORM-HELD-BYTES Stage B push 1, P1-5; hub v3 N-a/N-b, 2026-10-14).
 *
 * ID FIRST, then NAME. Before this, the three resolvers ran ONE findFirst matching either the id or the name,
 * which returns whichever row Postgres reads first when one row's id equals ANOTHER row's name — so a user who registered
 * a service NAMED after another service's id could capture calls addressed to that id. Now:
 *   - an id hit is TERMINAL whatever its status: the caller's own status check then says "not active" (or not found);
 *     it never falls through to a same-named row;
 *   - only when no row has that id is the name tried (`name` is @unique, mcp_tools_name_key).
 * Callers: service-call-handler.js (services → call), workflow-tools-handler.js (workflow steps),
 * lib/services/workflow/integrations/service-caller.ts (orchestration). Pinned by scripts/test-gateway-id-first.ts,
 * including the sweep grep (no id-or-name resolver left in lib/ or app/ beyond the two deliberate exclusions).
 * Registration refuses a name equal to an existing id or shaped like a platform id, so the shadowing case should not
 * arise; this is defence in depth, not a uniqueness guarantee.
 */

/**
 * @param {{ findUnique: (args: object) => Promise<any> }} mCPTool  prisma.mCPTool (or a transaction's)
 * @param {string} ref  the caller's targetService: a registry id or a service name
 * @param {object} [select]  an optional Prisma select, applied to both lookups
 * @returns {Promise<any|null>} the row, or null when neither an id nor a name matches
 */
async function findServiceByIdThenName(mCPTool, ref, select) {
  if (typeof ref !== 'string' || ref.length === 0) return null;
  const opts = select ? { select } : {};
  const byId = await mCPTool.findUnique({ where: { id: ref }, ...opts });
  if (byId) return byId;
  return mCPTool.findUnique({ where: { name: ref }, ...opts });
}

module.exports = { findServiceByIdThenName };
