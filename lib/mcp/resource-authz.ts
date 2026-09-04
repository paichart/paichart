/**
 * Resource-Authz Boundary Contract — classification map + assertion helper.
 *
 * One uniform contract for the `userContext` authz boundary into the embedded
 * MCP server's resource-read methods, replacing five inconsistent per-method
 * behaviors (throw / explicit-guard / fabricate-ADMIN / fabricate-system /
 * no-param). Design + reviews:
 * cline_docs/reviews/resource-boundary-contract-2026-06-13/IMPLEMENTATION-PLAN-v2.md
 * (boundary-contract 96/88, validation-engine 88, arch 93 GO, sec-ops 93 GO).
 *
 * HARD CONSTRAINT: this module must stay PRISMA-FREE (imports only
 * lib/types/auth) — it is unit-imported by scripts/test-security-invariants.ts
 * under the DATABASE_URL stub, and by lib/services/mcp/resourceManager.ts for
 * the classification-aware cache (Phase 0).
 */

import { UserRole } from '@/lib/types/auth';

export enum ResourceClassification {
  /** Reads tenant data. userContext REQUIRED — absent context throws (Pattern A). */
  TENANT_SCOPED = 'TENANT_SCOPED',
  /**
   * Tenant data with a documented internal-read allowance (agent reading its
   * own outputs mid-run). Absent context is permitted — the NAMED, classified
   * allowance (Pattern B) — but a present context is still shape-validated and
   * the method must POV-validate it (validateMCPPOVAccess).
   */
  INTERNAL_READ_ALLOWED = 'INTERNAL_READ_ALLOWED',
  /** No tenant data (global catalog / mock). userContext not required. */
  PUBLIC_CATALOG = 'PUBLIC_CATALOG',
}

export interface ResourceUserContext {
  userId: string;
  role: string;
}

/**
 * EVERY resource name dispatchable by embeddedMCPServer.readResource MUST
 * appear here. An unmapped name THROWS at the dispatch guard (the
 * 9th-method-without-classification fail-loud property) and is treated as
 * uncacheable at the resourceManager cache layer (fail-safe).
 *
 * 'agent-execution' is TENANT_SCOPED (not INTERNAL): the "internal mid-run
 * caller" its old {role:'ADMIN'} fabrication supposedly served was a phantom —
 * zero callers (sec-ops + arch, 2026-06-13). A future internal caller needs a
 * named allowance signed off by sec-ops.
 */
export const RESOURCE_AUTHZ: Record<string, ResourceClassification> = {
  'pov-database': ResourceClassification.TENANT_SCOPED,
  'task-database': ResourceClassification.TENANT_SCOPED,
  'ai-recommendations': ResourceClassification.TENANT_SCOPED,
  'team-performance': ResourceClassification.TENANT_SCOPED, // option (a), Steve 2026-06-13
  'agent-execution': ResourceClassification.TENANT_SCOPED,
  'agent-artifact': ResourceClassification.INTERNAL_READ_ALLOWED,
  'agent-templates': ResourceClassification.PUBLIC_CATALOG,
  'system-logs': ResourceClassification.PUBLIC_CATALOG, // mock/static data
};

/**
 * Single shared uri → resource-name resolver, used by BOTH the embedded
 * dispatch guard and the resourceManager cache layer — one enumeration, no
 * drift. Suffix-based so scheme variation (embedded://paichart/<name>,
 * mcp://database/<name>, mcp://<server>/<name>) cannot dodge the cache skip.
 * Returns null when no name can be extracted (callers treat null as
 * unmapped → fail-safe).
 */
export function resolveResourceName(uri: string): string | null {
  if (!uri || typeof uri !== 'string') return null;
  const withoutQuery = uri.split('?')[0];
  if (withoutQuery.includes('agent-execution/')) return 'agent-execution';
  if (withoutQuery.includes('agent-artifact/')) return 'agent-artifact';
  const name = withoutQuery.split('/').pop();
  return name && name.length > 0 ? name : null;
}

const VALID_ROLES = new Set<string>(Object.values(UserRole));

/**
 * The boundary contract. Plain throw, not Zod — userContext is constructed by
 * our own plumbing, so a bad shape is an internal invariant violation that
 * must fail loud + fail closed (mirrors buildPOVAccessFilter's throw).
 *
 * Layer 1 of 2: per-method row-scoping (buildPOVAccessFilter /
 * buildTaskAccessFilter / validateMCPPOVAccess) remains the second layer.
 */
export function assertResourceAuthz(
  resourceName: string,
  userContext: ResourceUserContext | undefined
): ResourceClassification {
  const classification = RESOURCE_AUTHZ[resourceName];
  if (!classification) {
    throw new Error(
      `No authz classification for resource '${resourceName}' — add it to RESOURCE_AUTHZ (lib/mcp/resource-authz.ts)`
    );
  }

  if (userContext !== undefined && userContext !== null) {
    // Shape validation applies to ANY classification when a context is presented.
    if (typeof userContext.userId !== 'string' || userContext.userId.trim().length === 0) {
      throw new Error(
        `Invalid userContext for resource '${resourceName}': userId must be a non-empty string`
      );
    }
    if (!VALID_ROLES.has(userContext.role)) {
      throw new Error(
        `Invalid userContext for resource '${resourceName}': role '${userContext.role}' is not a valid UserRole`
      );
    }
    if (
      classification === ResourceClassification.TENANT_SCOPED &&
      userContext.userId === 'system'
    ) {
      // The exact fabrication sentinel the old code manufactured — never a real identity.
      throw new Error(
        `Invalid userContext for resource '${resourceName}': fabricated 'system' identity rejected for tenant-scoped resources`
      );
    }
  } else if (classification === ResourceClassification.TENANT_SCOPED) {
    throw new Error(`userContext required for tenant-scoped resource '${resourceName}'`);
  }

  return classification;
}

/**
 * Cache-layer predicate (Phase 0): only PUBLIC_CATALOG content may enter the
 * shared, user-blind resourceManager content cache. TENANT_SCOPED is the
 * obvious skip; INTERNAL_READ_ALLOWED content (artifacts) is ALSO per-user
 * POV-validated tenant data — a user-blind cache hit would serve user B the
 * content user A's validation admitted, the same F1 leak class. Unmapped /
 * unresolvable names skip too (fail-safe: a renamed tenant resource must not
 * silently re-enter the shared cache; external-service resources lose the
 * 10-min content cache, accepted as correctness-first).
 */
export function isCacheableResource(uri: string): boolean {
  const name = resolveResourceName(uri);
  if (!name) return false;
  return RESOURCE_AUTHZ[name] === ResourceClassification.PUBLIC_CATALOG;
}
