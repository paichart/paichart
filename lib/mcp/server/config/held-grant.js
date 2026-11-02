/**
 * INTERNAL-FIT IF-3 (2026-10-24; design `cline_docs/reviews/held-network-2026-10-22/IF3-SHARED-ELIGIBILITY-DESIGN.md` v2/v3,
 * reviewed sec-ops 80 · mcp-hub 78 · database-manager 88) — the HOSTED owner-written POV grant: a colleague's PIPELINE run may
 * call a team's shared service AND hold its files, scoped to the granted POV.
 *
 * A call is granted iff ALL of (decided at call time, BEFORE checkServiceAccess — a grant confers access):
 *   1. the call comes from an agent execution (server-set `callingExecutionId`, never an argument) whose task POV is in the
 *      row's `heldGrantPovIds`;
 *   2. the CALLER is a literal member of that POV — `POV.ownerId` or a `TeamMember` row via `POV.teamId` (never
 *      validatePOVAccess: it admits admins, isSameTenant and demo reads);
 *   3. the row's OWNER is still a literal member of that POV (re-checked every call — a removed member stops granting);
 *   4. the POV is not a demo POV (`metadata.isDemo`, the access layer's one rule) and the owner is not a DEMO_USER.
 * Zero extra queries off the grant path: the statement runs only when the list is non-empty, the row has an owner, the
 * caller is not that owner, and an execution id is present. ONE parameterised statement, PK/unique lookups only
 * (execution → task → POV → owner/User + 2 × EXISTS TeamMember @@unique([teamId,userId])). ANY error ⇒ not granted.
 *
 * Plain CommonJS (bare Node, ts-node, webpack). Never throws.
 */
'use strict';

const MAX_GRANTS = 20;
const CUID = /^c[a-z0-9]{20,30}$/;

function grantListOf(row) {
  const v = row && Array.isArray(row.heldGrantPovIds) ? row.heldGrantPovIds : [];
  return v.filter((x) => typeof x === 'string' && x.length > 0);
}

function ownerOf(row) {
  const cfg = row && row.configuration && typeof row.configuration === 'object' ? row.configuration : null;
  return cfg && typeof cfg.ownerId === 'string' && cfg.ownerId ? cfg.ownerId : null;
}

const isDemoMetadata = (m) => !!m && typeof m === 'object' && m.isDemo === true;
/** sec-ops IF-3 build N-1: platform service accounts (the @paichart.system suffix — the monitor token is the live case) are never
 *  grant owners. Defence in depth: membership already stops them. */
const isServiceAccountEmail = (e) => typeof e === 'string' && /@paichart\.system$/i.test(e.trim());

/** Should the grant statement run at all? (pure — the zero-extra-query guard, pinned by test) */
function grantApplies(row, userId, callingExecutionId) {
  const owner = ownerOf(row);
  return grantListOf(row).length > 0 && !!owner && typeof userId === 'string' && !!userId && owner !== userId
    && typeof callingExecutionId === 'string' && callingExecutionId.length > 0;
}

/**
 * @returns {Promise<{ povId: string } | null>} the granting POV, or null (not granted — including on any error).
 */
async function decideGrant(prisma, row, userId, callingExecutionId, log) {
  if (!grantApplies(row, userId, callingExecutionId)) return null;
  const owner = ownerOf(row);
  try {
    const rows = await prisma.$queryRaw`
      SELECT t.pov_id                                   AS "povId",
             p."ownerId"                                AS "povOwnerId",
             p.metadata                                 AS "povMetadata",
             (SELECT u.role::text FROM "User" u WHERE u.id = ${owner}) AS "ownerRole",
             (SELECT u.email FROM "User" u WHERE u.id = ${owner}) AS "ownerEmail",
             EXISTS (SELECT 1 FROM "TeamMember" tm WHERE tm."teamId" = p."teamId" AND tm."userId" = ${userId}) AS "callerOnTeam",
             EXISTS (SELECT 1 FROM "TeamMember" tm WHERE tm."teamId" = p."teamId" AND tm."userId" = ${owner})  AS "ownerOnTeam"
        FROM agent_executions e
        JOIN tasks t ON t.id = e."taskId"
        JOIN "POV" p ON p.id = t.pov_id
       WHERE e.id = ${callingExecutionId}`;
    const r = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    if (!r || typeof r.povId !== 'string') return null;
    if (!grantListOf(row).includes(r.povId)) return null;
    if (isDemoMetadata(r.povMetadata)) return null;
    if (r.ownerRole === 'DEMO_USER' || isServiceAccountEmail(r.ownerEmail)) return null;
    const callerMember = r.povOwnerId === userId || r.callerOnTeam === true;
    const ownerMember = r.povOwnerId === owner || r.ownerOnTeam === true;
    if (!callerMember || !ownerMember) return null;
    return { povId: r.povId };
  } catch (err) {
    if (log && typeof log.warn === 'function') log.warn({ err: err && err.message, serviceId: row && row.id }, 'held grant check failed — not granted (fail closed)');
    return null;
  }
}

/**
 * The grant WRITE (sec-ops SF-1, mcp-hub SF-2): `registry update` only (never at register, v1). Refused, each by name, when:
 * an agent caller · the caller is not STRICTLY the row's owner (admins too) · a platform (ownerless) row · not an array of
 * distinct CUIDs · more than 20 · an unknown POV · a demo POV · a POV the owner is not a literal member of · a DEMO_USER owner.
 * An empty list is a valid write (revoke every grant). Returns { ok: true, povIds } | { ok: false, code }.
 */
async function checkGrantWrite(prisma, row, userId, povIds, isAgent) {
  if (isAgent) return { ok: false, code: 'GRANT_AGENT_REFUSED' };
  const owner = ownerOf(row);
  if (!owner) return { ok: false, code: 'GRANT_PLATFORM_ROW' };
  if (owner !== userId) return { ok: false, code: 'GRANT_NOT_OWNER' };
  if (!Array.isArray(povIds) || povIds.some((x) => typeof x !== 'string' || !CUID.test(x))) return { ok: false, code: 'GRANT_INVALID_ID' };
  if (new Set(povIds).size !== povIds.length) return { ok: false, code: 'GRANT_DUPLICATE_ID' };
  if (povIds.length > MAX_GRANTS) return { ok: false, code: 'GRANT_TOO_MANY' };
  if (povIds.length === 0) return { ok: true, povIds: [] };
  try {
    const role = await prisma.$queryRaw`SELECT u.role::text AS role, u.email AS email FROM "User" u WHERE u.id = ${owner}`;
    if (!Array.isArray(role) || role.length !== 1 || role[0].role === 'DEMO_USER' || isServiceAccountEmail(role[0].email)) return { ok: false, code: 'GRANT_OWNER_NOT_ELIGIBLE' };
    const povs = await prisma.$queryRaw`
      SELECT p.id, p.metadata AS "povMetadata", p."ownerId" AS "povOwnerId",
             EXISTS (SELECT 1 FROM "TeamMember" tm WHERE tm."teamId" = p."teamId" AND tm."userId" = ${owner}) AS "ownerOnTeam"
        FROM "POV" p WHERE p.id = ANY(${povIds})`;
    const byId = new Map((Array.isArray(povs) ? povs : []).map((r) => [r.id, r]));
    for (const id of povIds) {
      const r = byId.get(id);
      if (!r) return { ok: false, code: 'GRANT_UNKNOWN_POV' };
      if (isDemoMetadata(r.povMetadata)) return { ok: false, code: 'GRANT_DEMO_POV' };
      if (!(r.povOwnerId === owner || r.ownerOnTeam === true)) return { ok: false, code: 'GRANT_NOT_A_MEMBER' };
    }
    return { ok: true, povIds };
  } catch {
    return { ok: false, code: 'GRANT_CHECK_FAILED' };
  }
}

module.exports = { MAX_GRANTS, CUID, grantListOf, ownerOf, grantApplies, decideGrant, checkGrantWrite, isDemoMetadata, isServiceAccountEmail };
